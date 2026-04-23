import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNow, setVirtualTime, setSimulationMode, isSimulationMode, loadVirtualTime } from "@/lib/time";
import { applyMatchResult } from "@/lib/scores";
import { isPredictionLocked } from "@/lib/scoring";
import { sendMatchReminders } from "@/lib/notifications";
import { generateLockNotifications } from "@/lib/userNotifications";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

// ── GET: current simulation state + upcoming real matches ─────────────────────

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await loadVirtualTime(); // ensure module state matches DB
  const now = getNow();
  const settings = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
  const simulationMatchIds: string[] = settings?.simulationMatchIds
    ? JSON.parse(settings.simulationMatchIds)
    : [];

  // Fetch all real matches with prediction counts
  const matches = await prisma.match.findMany({
    where: { isDemo: false },
    orderBy: { kickoff: "asc" },
    include: {
      _count: { select: { predictions: true } },
    },
  });

  // Leaderboard snapshot: top 10 by total points across all real predictions
  const memberships = await prisma.groupMembership.findMany({
    where: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          predictions: { where: { points: { not: null } }, select: { points: true } },
        },
      },
    },
  });

  const leaderboard = Object.values(
    memberships.reduce<Record<string, { id: string; name: string; points: number }>>(
      (acc, m) => {
        const id = m.user.id;
        if (!acc[id]) acc[id] = { id, name: m.user.name ?? "?", points: 0 };
        acc[id].points += m.user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
        return acc;
      },
      {}
    )
  )
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  return NextResponse.json({
    active: isSimulationMode(),
    virtualTime: now.toISOString(),
    realTime: new Date().toISOString(),
    simulationMatchIds,
    matches: matches.map((m) => ({
      id: m.id,
      matchNumber: m.matchNumber,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      group: m.group,
      round: m.round,
      kickoff: m.kickoff.toISOString(),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      predictionCount: m._count.predictions,
      isLocked: isPredictionLocked(m.kickoff),
      isScoredInSim: simulationMatchIds.includes(m.id),
    })),
    leaderboard,
  });
}

// ── POST: action dispatch ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { action: string; [k: string]: unknown };

  switch (body.action) {
    case "activate":   return handleActivate();
    case "deactivate": return handleDeactivate();
    case "clear":      return handleClear();
    case "advanceTime": return handleAdvanceTime(body);
    case "setTime":    return handleSetTime(body);
    case "setScore":   return handleSetScore(body);
    case "resetMatch": return handleResetMatch(body);
    case "genTestInvite":     return handleGenTestInvite(session);
    case "genTestResetLink":  return handleGenTestResetLink(session);
    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}

// ── Test helpers (admin only) ────────────────────────────────────────────────

async function handleGenTestInvite(session: Awaited<ReturnType<typeof requireAdmin>>) {
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { randomBytes } = await import("crypto");

  // Find first available real group
  const group = await prisma.group.findFirst({ where: {}, select: { id: true, name: true } });
  if (!group) return NextResponse.json({ error: "No groups found" }, { status: 404 });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.groupInvite.create({
    data: {
      groupId: group.id,
      email: session.user.email ?? "admin@test.com",
      memberRole: "MEMBER",
      token,
      expiresAt,
      createdBy: session.user.id,
    },
  });

  const url = `${process.env.NEXTAUTH_URL}/invite/${token}`;
  return NextResponse.json({ ok: true, url, groupName: group.name });
}

async function handleGenTestResetLink(session: Awaited<ReturnType<typeof requireAdmin>>) {
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { randomBytes } = await import("crypto");

  const email = session.user.email;
  if (!email) return NextResponse.json({ error: "No email on session" }, { status: 400 });

  // Delete any existing reset token
  await prisma.verificationToken.deleteMany({ where: { identifier: `reset:${email}` } });

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await prisma.verificationToken.create({
    data: { identifier: `reset:${email}`, token, expires },
  });

  const url = `${process.env.NEXTAUTH_URL}/reset-password/${token}`;
  return NextResponse.json({ ok: true, url });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleActivate() {
  // Always start at Jun 11 2026 10:00am PDT (UTC-7 = 17:00 UTC)
  const defaultSimTime = new Date("2026-06-11T17:00:00.000Z");
  await setSimulationMode(true);
  await setVirtualTime(defaultSimTime);
  return NextResponse.json({ ok: true, virtualTime: defaultSimTime.toISOString() });
}

async function resetAndDeactivate(): Promise<number> {
  const settings = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
  const simulationMatchIds: string[] = settings?.simulationMatchIds
    ? JSON.parse(settings.simulationMatchIds)
    : [];

  let reset = 0;
  for (const matchId of simulationMatchIds) {
    await prisma.prediction.updateMany({ where: { matchId }, data: { points: null } });
    await prisma.match.update({
      where: { id: matchId },
      data: { homeScore: null, awayScore: null, status: "SCHEDULED" },
    });
    reset++;
  }

  await prisma.matchReminder.deleteMany({});
  await prisma.demoSettings.upsert({
    where: { id: "demo" },
    update: { simulationActive: false, simulationMatchIds: "[]", virtualTime: new Date() },
    create: { id: "demo", simulationActive: false, simulationMatchIds: "[]", virtualTime: new Date() },
  });
  await setSimulationMode(false);
  return reset;
}

async function handleDeactivate() {
  const reset = await resetAndDeactivate();
  return NextResponse.json({ ok: true, matchesReset: reset });
}

async function handleClear() {
  const reset = await resetAndDeactivate();
  return NextResponse.json({ ok: true, matchesReset: reset });
}

async function handleAdvanceTime(body: Record<string, unknown>) {
  if (!isSimulationMode()) return NextResponse.json({ error: "Simulation not active" }, { status: 400 });
  const minutes = Number(body.minutes ?? 60);
  const next = new Date(getNow().getTime() + minutes * 60_000);
  await setVirtualTime(next);
  // Trigger notifications for matches coming up in the ~2h window
  try {
    await sendMatchReminders();
    await generateLockNotifications();
  } catch (e) { console.error("[sim] reminder check failed:", e); }
  return NextResponse.json({ ok: true, virtualTime: next.toISOString() });
}

async function handleSetTime(body: Record<string, unknown>) {
  if (!isSimulationMode()) return NextResponse.json({ error: "Simulation not active" }, { status: 400 });
  const date = new Date(String(body.iso));
  if (isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  await setVirtualTime(date);
  // Trigger notifications for matches coming up in the ~2h window
  try {
    await sendMatchReminders();
    await generateLockNotifications();
  } catch (e) { console.error("[sim] reminder check failed:", e); }
  return NextResponse.json({ ok: true, virtualTime: date.toISOString() });
}

async function handleSetScore(body: Record<string, unknown>) {
  if (!isSimulationMode()) return NextResponse.json({ error: "Simulation not active" }, { status: 400 });
  const { matchId, homeScore, awayScore } = body as { matchId: string; homeScore: number; awayScore: number };
  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const wasFinished = match.status === "FINISHED";
  const prevHome = match.homeScore;
  const prevAway = match.awayScore;

  // Reset then apply so applyMatchResult recalculates points cleanly
  await prisma.match.update({ where: { id: matchId }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  await applyMatchResult(matchId, Number(homeScore), Number(awayScore));

  // If this was a correction, notify all affected predictors
  if (wasFinished && (prevHome !== Number(homeScore) || prevAway !== Number(awayScore))) {
    const affectedPreds = await prisma.prediction.findMany({
      where: { matchId },
      select: { userId: true },
      distinct: ["userId"],
    });
    const label = `${match.homeTeam} vs ${match.awayTeam}`;
    await Promise.allSettled(
      affectedPreds.map((p) =>
        prisma.notification.create({
          data: {
            userId: p.userId,
            type: "score_corrected",
            title: "Score corrected",
            body: `${label}: ${prevHome}–${prevAway} → ${homeScore}–${awayScore}. Your points were updated.`,
            matchId,
            read: false,
          },
        })
      )
    );
  }

  // Track this match as scored during simulation
  const settings = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
  const tracked: string[] = settings?.simulationMatchIds ? JSON.parse(settings.simulationMatchIds) : [];
  if (!tracked.includes(matchId)) {
    tracked.push(matchId);
    await prisma.demoSettings.update({ where: { id: "demo" }, data: { simulationMatchIds: JSON.stringify(tracked) } });
  }

  return NextResponse.json({ ok: true, match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, homeScore, awayScore } });
}

async function handleResetMatch(body: Record<string, unknown>) {
  if (!isSimulationMode()) return NextResponse.json({ error: "Simulation not active" }, { status: 400 });
  const { matchId } = body as { matchId: string };
  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  await prisma.prediction.updateMany({ where: { matchId }, data: { points: null } });
  await prisma.match.update({ where: { id: matchId }, data: { homeScore: null, awayScore: null, status: "SCHEDULED" } });

  // Remove from tracked list
  const settings = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
  const tracked: string[] = settings?.simulationMatchIds ? JSON.parse(settings.simulationMatchIds) : [];
  const updated = tracked.filter((id) => id !== matchId);
  await prisma.demoSettings.update({ where: { id: "demo" }, data: { simulationMatchIds: JSON.stringify(updated) } });

  return NextResponse.json({ ok: true });
}
