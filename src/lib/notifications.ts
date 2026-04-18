import { prisma } from "@/lib/prisma";
import { calculatePoints } from "@/lib/scoring";
import { sendReminderEmail, sendPostGameEmail } from "@/lib/email";
import { sendPushToUser, sendPushToAll } from "@/lib/webpush";

// ── 2-hour reminder ──────────────────────────────────────────────────────────

export async function sendMatchReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 90 * 60 * 1000);  // 1.5 hr from now
  const windowEnd = new Date(now.getTime() + 150 * 60 * 1000);   // 2.5 hr from now

  const upcomingMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      kickoff: { gte: windowStart, lte: windowEnd },
    },
  });

  if (upcomingMatches.length === 0) return;

  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, name: true },
  });

  for (const user of users) {
    const matchesToRemind: typeof upcomingMatches = [];

    for (const match of upcomingMatches) {
      // Skip if already reminded
      const alreadySent = await prisma.matchReminder.findUnique({
        where: { userId_matchId: { userId: user.id, matchId: match.id } },
      });
      if (alreadySent) continue;

      // Skip if user already predicted
      const hasPrediction = await prisma.prediction.findUnique({
        where: { userId_matchId: { userId: user.id, matchId: match.id } },
      });
      if (hasPrediction) continue;

      matchesToRemind.push(match);
    }

    if (matchesToRemind.length === 0) continue;

    // Send email reminder
    try {
      if (user.email) {
        await sendReminderEmail(user.email, user.name ?? "Predictor", matchesToRemind);
      }
    } catch { /* non-fatal */ }

    // Send push notification
    const body =
      matchesToRemind.length === 1
        ? `${matchesToRemind[0].homeTeam} vs ${matchesToRemind[0].awayTeam} kicks off in ~2 hours!`
        : `${matchesToRemind.length} matches kick off in ~2 hours — predict now!`;

    await sendPushToUser(user.id, {
      title: "⚽ Don't forget to predict!",
      body,
      url: "/matches",
      tag: "reminder",
    });

    // Mark reminders as sent
    await Promise.allSettled(
      matchesToRemind.map((m) =>
        prisma.matchReminder.upsert({
          where: { userId_matchId: { userId: user.id, matchId: m.id } },
          update: {},
          create: { userId: user.id, matchId: m.id },
        })
      )
    );
  }
}

// ── Post-game notifications ───────────────────────────────────────────────────

export async function sendPostGameNotifications(
  matchId: string,
  homeScore: number,
  awayScore: number,
  exactPoints: number,
  directionPoints: number
) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return;

  const predictions = await prisma.prediction.findMany({
    where: { matchId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // ── Build insights ──────────────────────────────────────────────────────────
  const exactScorers: string[] = [];
  const directionCorrect: string[] = [];
  const wrong: string[] = [];

  for (const pred of predictions) {
    const result = calculatePoints(
      pred.homeScore, pred.awayScore, homeScore, awayScore, exactPoints, directionPoints
    );
    const displayName = pred.user.name ?? pred.user.email ?? "Someone";
    if (result.exact) exactScorers.push(displayName);
    else if (result.direction) directionCorrect.push(displayName);
    else wrong.push(displayName);
  }

  const insights: { emoji: string; text: string }[] = [];

  if (exactScorers.length === 0 && directionCorrect.length === 0) {
    insights.push({ emoji: "😅", text: "Nobody predicted this result correctly!" });
  } else {
    if (exactScorers.length > 0) {
      if (exactScorers.length === 1) {
        insights.push({ emoji: "🔮", text: `${exactScorers[0]} was the only one to get the exact score!` });
      } else if (exactScorers.length === predictions.length) {
        insights.push({ emoji: "🎯", text: `Everyone got the exact score — ${exactScorers.length} players earn ${exactPoints} pts!` });
      } else {
        insights.push({ emoji: "🎯", text: `${exactScorers.length} player${exactScorers.length > 1 ? "s" : ""} got the exact score: ${exactScorers.join(", ")}` });
      }
    }
    if (directionCorrect.length === 1 && exactScorers.length === 0) {
      insights.push({ emoji: "👑", text: `Only ${directionCorrect[0]} predicted the correct winner/draw!` });
    } else if (directionCorrect.length > 0) {
      insights.push({ emoji: "✅", text: `${directionCorrect.length} player${directionCorrect.length > 1 ? "s" : ""} got the right result` });
    }
    if (wrong.length > 0) {
      insights.push({ emoji: "❌", text: `${wrong.length} player${wrong.length > 1 ? "s" : ""} got it wrong` });
    }
    if (predictions.length === 0) {
      insights.push({ emoji: "📭", text: "No predictions were submitted for this match" });
    }
  }

  // ── Build leaderboard snapshot ─────────────────────────────────────────────
  // Points gained per user from this match
  const pointsGainedMap: Record<string, number> = {};
  for (const pred of predictions) {
    const result = calculatePoints(
      pred.homeScore, pred.awayScore, homeScore, awayScore, exactPoints, directionPoints
    );
    pointsGainedMap[pred.userId] = result.points;
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      predictions: { where: { points: { not: null } }, select: { points: true } },
    },
  });

  const leaderboard = users
    .map((u) => ({
      id: u.id,
      name: u.name ?? u.email ?? "Anonymous",
      email: u.email,
      totalPoints: u.predictions.reduce((s, p) => s + (p.points ?? 0), 0),
      pointsGained: pointsGainedMap[u.id] ?? 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  const top3 = leaderboard.slice(0, 3);

  // ── Send to each user ───────────────────────────────────────────────────────
  const matchLabel = `${match.homeTeam} ${homeScore}–${awayScore} ${match.awayTeam}`;
  const pushBody = buildPushBody(insights, top3);

  await Promise.allSettled(
    leaderboard.map(async (entry) => {
      // Email
      try {
        if (entry.email) {
          await sendPostGameEmail(
            entry.email,
            entry.name,
            { homeTeam: match.homeTeam, awayTeam: match.awayTeam, homeScore, awayScore },
            insights,
            top3,
            entry.rank > 3 ? entry : undefined
          );
        }
      } catch { /* non-fatal */ }

      // Push
      await sendPushToUser(entry.id, {
        title: `⚽ Result: ${matchLabel}`,
        body: pushBody,
        url: "/leaderboard",
        tag: `result-${matchId}`,
      });
    })
  );
}

function buildPushBody(
  insights: { emoji: string; text: string }[],
  top3: { name: string; totalPoints: number }[]
): string {
  const topInsight = insights[0]?.text ?? "";
  const leader = top3[0];
  return leader
    ? `${topInsight} · 🥇 ${leader.name} leads with ${leader.totalPoints} pts`
    : topInsight;
}
