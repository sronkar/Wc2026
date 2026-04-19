import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNow, setVirtualTime, isDemoMode } from "@/lib/time";
import { isPredictionLocked, calculatePoints } from "@/lib/scoring";
import { applyMatchResult } from "@/lib/scores";
import { sendMatchReminders } from "@/lib/notifications";
import { pollAndUpdateScores } from "@/lib/scores";

function guard() {
  if (!isDemoMode()) {
    return NextResponse.json({ error: "Demo mode not enabled. Set DEMO_MODE=true in .env" }, { status: 403 });
  }
  return null;
}

function relativeLabel(kickoff: Date, now: Date): string {
  const diffMin = Math.round((kickoff.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  const fmt = abs < 60 ? `${abs}m` : `${Math.floor(abs / 60)}h${abs % 60 ? `${abs % 60}m` : ""}`;
  return diffMin > 0 ? `T-${fmt}` : diffMin < 0 ? `T+${fmt}` : "T";
}

// ── GET: return full demo state ───────────────────────────────────────────────

export async function GET() {
  const g = guard(); if (g) return g;

  const now = getNow();

  const [demoMatches, demoUsers] = await Promise.all([
    prisma.match.findMany({
      where: { isDemo: true },
      include: {
        predictions: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { kickoff: "asc" },
    }),
    prisma.user.findMany({
      where: { isDemo: true },
      select: {
        id: true, name: true, email: true,
        predictions: {
          where: { match: { isDemo: true } },
          select: { matchId: true, homeScore: true, awayScore: true, points: true },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    virtualTime: now.toISOString(),
    realTime: new Date().toISOString(),
    demoMatches: demoMatches.map((m) => ({
      id: m.id,
      matchNumber: m.matchNumber,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoff: m.kickoff.toISOString(),
      relativeLabel: relativeLabel(m.kickoff, now),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      isLocked: isPredictionLocked(m.kickoff),
      predictions: m.predictions.map((p) => ({
        userId: p.userId,
        userName: p.user.name,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        points: p.points,
      })),
    })),
    demoUsers: demoUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      predictions: u.predictions,
    })),
  });
}

// ── POST: action dispatch ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const g = guard(); if (g) return g;

  const body = await req.json();
  switch (body.action) {
    case "reset":          return handleReset();
    case "addMatch":       return handleAddMatch(body);
    case "addUsers":       return handleAddUsers(body);
    case "advanceTime":    return handleAdvanceTime(body);
    case "setTime":        return handleSetTime(body);
    case "autoPredict":    return handleAutoPredict(body);
    case "addPrediction":  return handleAddPrediction(body);
    case "setScore":       return handleSetScore(body);
    case "triggerReminders": return handleTriggerReminders();
    case "triggerPoll":    return handleTriggerPoll();
    case "simulate":       return handleSimulate(body);
    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleReset() {
  const matchIds = (await prisma.match.findMany({ where: { isDemo: true }, select: { id: true } }))
    .map((m) => m.id);

  await prisma.matchReminder.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.prediction.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.match.deleteMany({ where: { isDemo: true } });

  const userIds = (await prisma.user.findMany({ where: { isDemo: true }, select: { id: true } }))
    .map((u) => u.id);
  await prisma.matchReminder.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.prediction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { isDemo: true } });

  await setVirtualTime(new Date());
  return NextResponse.json({ ok: true, message: "Demo environment reset to real time" });
}

async function handleAddMatch(body: Record<string, unknown>) {
  const { homeTeam, awayTeam, kickoffOffsetMinutes = 120, round = "Demo", venue = "Demo Stadium", city = "Demo City", group = null } = body as {
    homeTeam: string; awayTeam: string; kickoffOffsetMinutes?: number;
    round?: string; venue?: string; city?: string; group?: string | null;
  };

  if (!homeTeam || !awayTeam) {
    return NextResponse.json({ error: "homeTeam and awayTeam are required" }, { status: 400 });
  }

  const kickoff = new Date(getNow().getTime() + Number(kickoffOffsetMinutes) * 60_000);
  const last = await prisma.match.findFirst({ orderBy: { matchNumber: "desc" } });
  const matchNumber = (last?.matchNumber ?? 0) + 1;

  const match = await prisma.match.create({
    data: { matchNumber, homeTeam: String(homeTeam), awayTeam: String(awayTeam), group: group ? String(group) : null, round: String(round), venue: String(venue), city: String(city), kickoff, status: "SCHEDULED", isDemo: true },
  });

  return NextResponse.json({ ok: true, match });
}

const DEMO_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry", "Iris", "Jack",
  "Karen", "Leo", "Mia", "Noah", "Olivia", "Paul", "Quinn", "Rachel", "Sam", "Tina"];

async function handleAddUsers(body: Record<string, unknown>) {
  const count = Math.min(Number(body.count ?? 5), 20);
  const existing = new Set(
    (await prisma.user.findMany({ where: { isDemo: true }, select: { name: true } })).map((u) => u.name)
  );

  const created = [];
  for (let i = 0; created.length < count && i < 100; i++) {
    const base = DEMO_NAMES[i % DEMO_NAMES.length];
    const suffix = i >= DEMO_NAMES.length ? ` ${Math.floor(i / DEMO_NAMES.length) + 1}` : "";
    const name = `${base}${suffix}`;
    if (existing.has(name)) continue;
    const email = `${name.toLowerCase().replace(/\s+/g, ".")}@demo.test`;
    created.push(await prisma.user.create({ data: { name, email, role: "USER", isDemo: true } }));
    existing.add(name);
  }

  return NextResponse.json({ ok: true, created: created.length, users: created.map((u) => ({ id: u.id, name: u.name, email: u.email })) });
}

async function handleAdvanceTime(body: Record<string, unknown>) {
  const minutes = Number(body.minutes ?? 60);
  const prev = getNow();
  const next = new Date(prev.getTime() + minutes * 60_000);
  await setVirtualTime(next);
  return NextResponse.json({ ok: true, previousTime: prev.toISOString(), newTime: next.toISOString(), advancedMinutes: minutes });
}

async function handleSetTime(body: Record<string, unknown>) {
  const date = new Date(String(body.iso));
  if (isNaN(date.getTime())) return NextResponse.json({ error: "Invalid ISO date" }, { status: 400 });
  await setVirtualTime(date);
  return NextResponse.json({ ok: true, virtualTime: date.toISOString() });
}

async function handleAutoPredict(body: Record<string, unknown>) {
  const { matchId } = body as { matchId?: string };
  const demoUsers = await prisma.user.findMany({ where: { isDemo: true } });

  const matches = await prisma.match.findMany({
    where: matchId ? { id: matchId, isDemo: true } : { isDemo: true, status: "SCHEDULED" },
  });

  const firstGroup = await prisma.group.findFirst({ select: { id: true } });
  if (!firstGroup) return NextResponse.json({ ok: true, predictionsAdded: 0, note: "No groups found — create a group first" });

  let count = 0;
  for (const match of matches) {
    if (isPredictionLocked(match.kickoff)) continue;
    for (const user of demoUsers) {
      const exists = await prisma.prediction.findFirst({
        where: { userId: user.id, matchId: match.id, groupId: firstGroup.id },
      });
      if (exists) continue;
      await prisma.prediction.create({
        data: { userId: user.id, matchId: match.id, groupId: firstGroup.id, homeScore: Math.floor(Math.random() * 4), awayScore: Math.floor(Math.random() * 4) },
      });
      count++;
    }
  }
  return NextResponse.json({ ok: true, predictionsAdded: count });
}

async function handleAddPrediction(body: Record<string, unknown>) {
  const { userId, matchId, homeScore, awayScore, groupId: bodyGroupId } = body as { userId: string; matchId: string; homeScore: number; awayScore: number; groupId?: string };

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (isPredictionLocked(match.kickoff)) return NextResponse.json({ error: "Predictions locked" }, { status: 409 });

  const groupId = bodyGroupId ?? (await prisma.group.findFirst({ select: { id: true } }))?.id;
  if (!groupId) return NextResponse.json({ error: "No group found" }, { status: 400 });

  const prediction = await prisma.prediction.upsert({
    where: { userId_matchId_groupId: { userId, matchId, groupId } },
    update: { homeScore, awayScore },
    create: { userId, matchId, groupId, homeScore, awayScore },
  });
  return NextResponse.json({ ok: true, prediction });
}

async function handleSetScore(body: Record<string, unknown>) {
  const { matchId, homeScore, awayScore } = body as { matchId: string; homeScore: number; awayScore: number };

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (!match.isDemo) return NextResponse.json({ error: "Can only set scores on demo matches via this endpoint" }, { status: 403 });

  // Demo matches may be reset and re-scored; set to SCHEDULED first so applyMatchResult runs cleanly
  await prisma.match.update({ where: { id: matchId }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  await applyMatchResult(matchId, Number(homeScore), Number(awayScore));
  return NextResponse.json({ ok: true });
}

async function handleTriggerReminders() {
  sendMatchReminders().catch((e) => console.error("[demo] reminders:", e));
  return NextResponse.json({ ok: true, message: "Reminders job triggered (runs in background)", virtualTime: getNow().toISOString() });
}

async function handleTriggerPoll() {
  const result = await pollAndUpdateScores();
  return NextResponse.json({ ok: true, ...result, virtualTime: getNow().toISOString() });
}

// ── Full timeline simulation for a single demo match ─────────────────────────

async function handleSimulate(body: Record<string, unknown>) {
  const { matchId, homeScore, awayScore } = body as { matchId: string; homeScore: number; awayScore: number };
  const log: string[] = [];

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (!match.isDemo) return NextResponse.json({ error: "Can only simulate demo matches" }, { status: 403 });

  const kickoffMs = match.kickoff.getTime();

  // Step 1 – auto-predict for any demo users who haven't predicted yet
  const demoUsers = await prisma.user.findMany({ where: { isDemo: true } });
  const firstGroup = await prisma.group.findFirst({ select: { id: true } });
  const simGroupId = firstGroup?.id;
  let autoPredCount = 0;
  for (const user of demoUsers) {
    const exists = simGroupId
      ? await prisma.prediction.findFirst({ where: { userId: user.id, matchId, groupId: simGroupId } })
      : null;
    if (!exists && simGroupId) {
      await prisma.prediction.create({
        data: { userId: user.id, matchId, groupId: simGroupId, homeScore: Math.floor(Math.random() * 4), awayScore: Math.floor(Math.random() * 4) },
      });
      autoPredCount++;
    }
  }
  if (autoPredCount > 0) log.push(`🎲 Auto-predicted ${autoPredCount} missing prediction${autoPredCount !== 1 ? "s" : ""}`);

  const totalPreds = await prisma.prediction.count({ where: { matchId } });
  log.push(`📊 ${totalPreds} prediction${totalPreds !== 1 ? "s" : ""} total for ${match.homeTeam} vs ${match.awayTeam}`);

  // Step 2 – jump to T-2h and fire reminders
  const reminderTime = new Date(kickoffMs - 2 * 60 * 60 * 1000);
  await setVirtualTime(reminderTime);
  log.push(`⏩ Time → ${reminderTime.toUTCString()} (T-2h)`);

  await sendMatchReminders();
  log.push(`📧 Reminders sent to users who hadn't predicted`);

  // Step 3 – jump to T+2h, set the score, process results
  const postMatchTime = new Date(kickoffMs + 2 * 60 * 60 * 1000);
  await setVirtualTime(postMatchTime);
  log.push(`⏩ Time → ${postMatchTime.toUTCString()} (T+2h)`);

  // Reset to SCHEDULED so applyMatchResult won't be blocked
  await prisma.match.update({ where: { id: matchId }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  await applyMatchResult(matchId, Number(homeScore), Number(awayScore));
  log.push(`⚽ Score recorded: ${match.homeTeam} ${homeScore}–${awayScore} ${match.awayTeam}`);

  // Step 4 – build leaderboard snapshot
  const settings = await prisma.pointSettings.findUnique({ where: { id: "default" } });
  const exactPts = settings?.exactMatchPoints ?? 5;
  const dirPts = settings?.directionMatchPoints ?? 1;

  const predictions = await prisma.prediction.findMany({
    where: { matchId },
    include: { user: { select: { name: true } } },
  });

  const exactScorers: string[] = [];
  const directionOnly: string[] = [];
  const wrong: string[] = [];

  for (const p of predictions) {
    const r = calculatePoints(p.homeScore, p.awayScore, Number(homeScore), Number(awayScore), exactPts, dirPts);
    const name = p.user.name ?? "?";
    if (r.exact) exactScorers.push(name);
    else if (r.direction) directionOnly.push(name);
    else wrong.push(name);
  }

  if (exactScorers.length) log.push(`🎯 Exact score (${exactPts}pts): ${exactScorers.join(", ")}`);
  if (directionOnly.length) log.push(`✅ Correct result (${dirPts}pt): ${directionOnly.join(", ")}`);
  if (wrong.length) log.push(`❌ Wrong: ${wrong.join(", ")}`);
  if (!predictions.length) log.push("📭 No predictions were submitted");

  // Step 5 – overall leaderboard top 3
  const allUsers = await prisma.user.findMany({
    where: { isDemo: true },
    select: { name: true, predictions: { select: { points: true } } },
  });
  const board = allUsers
    .map((u) => ({ name: u.name ?? "?", pts: u.predictions.reduce((s, p) => s + (p.points ?? 0), 0) }))
    .sort((a, b) => b.pts - a.pts);

  if (board.length) {
    const medals = ["🥇", "🥈", "🥉"];
    log.push(`🏆 Demo leaderboard: ${board.slice(0, 3).map((e, i) => `${medals[i] ?? `#${i + 1}`} ${e.name} ${e.pts}pts`).join("  ")}`);
  }

  return NextResponse.json({ ok: true, log, virtualTime: postMatchTime.toISOString() });
}
