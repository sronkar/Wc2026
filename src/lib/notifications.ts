import { prisma } from "@/lib/prisma";
import { calculatePoints } from "@/lib/scoring";
import { sendReminderEmail, sendPostGameEmail, sendSubAdminActionEmail, type PredRow } from "@/lib/email";
import { sendPushToUser, sendPushToAll } from "@/lib/webpush";
import { getNow } from "@/lib/time";

// ── 2-hour reminder ──────────────────────────────────────────────────────────

export async function sendMatchReminders() {
  const now = getNow();
  const windowStart = new Date(now.getTime() + 90 * 60 * 1000);  // 1.5 hr from now
  const windowEnd = new Date(now.getTime() + 150 * 60 * 1000);   // 2.5 hr from now

  const upcomingMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      kickoff: { gte: windowStart, lte: windowEnd },
    },
  });

  if (upcomingMatches.length === 0) return;

  // Only users who are approved predictors in at least one group can be reminded.
  const users = await prisma.user.findMany({
    where: {
      email: { not: null }, isDemo: { not: true },
      groupMemberships: { some: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } } },
    },
    select: {
      id: true, email: true, name: true, emailNotifications: true, emailReminders: true,
      groupMemberships: {
        where: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
        select: { groupId: true },
      },
    },
  });

  const matchIds = upcomingMatches.map((m) => m.id);
  const userIds = users.map((u) => u.id);

  const [alreadySentRecords, lock30mRecords, existingPredictions] = await Promise.all([
    prisma.matchReminder.findMany({
      where: { matchId: { in: matchIds }, userId: { in: userIds } },
      select: { userId: true, matchId: true },
    }),
    // If lock_30m was already sent for this match+user, skip the 1h reminder to avoid double-email
    prisma.notification.findMany({
      where: { matchId: { in: matchIds }, userId: { in: userIds }, type: "lock_30m" },
      select: { userId: true, matchId: true },
    }),
    prisma.prediction.findMany({
      where: { matchId: { in: matchIds }, userId: { in: userIds } },
      select: { userId: true, matchId: true, groupId: true },
    }),
  ]);

  const alreadySentSet = new Set(alreadySentRecords.map((r) => `${r.userId}:${r.matchId}`));
  const lock30mSet     = new Set(lock30mRecords.map((r) => `${r.userId}:${r.matchId}`));
  // (userId, matchId, groupId) — per-group prediction dedup
  const predictedSet   = new Set(existingPredictions.map((r) => `${r.userId}:${r.matchId}:${r.groupId}`));

  for (const user of users) {
    const userGroupIds = user.groupMemberships.map((gm) => gm.groupId);
    const matchesToRemind: typeof upcomingMatches = [];

    for (const match of upcomingMatches) {
      // Skip if already reminded
      if (alreadySentSet.has(`${user.id}:${match.id}`)) continue;
      // Skip if lock_30m email already sent — prevent double-email in the overlap window
      if (lock30mSet.has(`${user.id}:${match.id}`)) continue;
      // Per-group: remind only if at least one of the user's groups has no prediction yet
      const hasUnpredictedGroup = userGroupIds.some(
        (gid) => !predictedSet.has(`${user.id}:${match.id}:${gid}`)
      );
      if (!hasUnpredictedGroup) continue;

      matchesToRemind.push(match);
    }

    if (matchesToRemind.length === 0) continue;

    // Send email reminder
    try {
      if (user.email && user.emailNotifications && user.emailReminders) {
        await sendReminderEmail(user.email, user.name ?? "Predictor", matchesToRemind);
      }
    } catch { /* non-fatal */ }

    // Send push notification
    // Lock is kickoff−60min; our window fires when lock is 30–90 min away
    const body =
      matchesToRemind.length === 1
        ? `${matchesToRemind[0].homeTeam} vs ${matchesToRemind[0].awayTeam} — predictions lock in ~1 hour!`
        : `${matchesToRemind.length} matches lock for predictions in ~1 hour — predict now!`;

    await sendPushToUser(user.id, {
      title: "⚽ Predictions lock soon!",
      body,
      url: "/groups",
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

  // ── Dedup guard: skip email blast if already processed for this match ───────
  // Uses "post_game_email" (not "result" which is a per-user in-app notification
  // created by generateResultNotification — using "result" here would always match).
  const alreadyProcessed = await prisma.notification.findFirst({
    where: { matchId, type: "post_game_email" },
  });
  if (alreadyProcessed) return;

  const matchLabel = `${match.homeTeam} ${homeScore}–${awayScore} ${match.awayTeam}`;

  // Fetch all predictions for this match, including groupId
  const allPredictions = await prisma.prediction.findMany({
    where: { matchId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // ── Find all groups that have at least one prediction for this match ─────────
  const groupIds = Array.from(new Set(allPredictions.map((p) => p.groupId)));

  // ── Per-group email + push sends ──────────────────────────────────────────
  // Insights and counts are computed per-group so no cross-group info leaks
  // into a member's email or push (names and totals stay group-scoped).
  for (const groupId of groupIds) {
    const groupPredictions = allPredictions.filter((p) => p.groupId === groupId);
    const predictedUserIds = new Set(groupPredictions.map((p) => p.userId));
    const pointsGainedMap: Record<string, number> = {};

    const exactScorers: string[] = [];
    const directionCorrect: string[] = [];
    const wrong: string[] = [];

    for (const pred of groupPredictions) {
      const result = calculatePoints(pred.homeScore, pred.awayScore, homeScore, awayScore, exactPoints, directionPoints);
      pointsGainedMap[pred.userId] = result.points;
      const displayName = pred.user.name ?? pred.user.email ?? "Someone";
      if (result.exact) exactScorers.push(displayName);
      else if (result.direction) directionCorrect.push(displayName);
      else wrong.push(displayName);
    }

    const insights = buildInsights(exactScorers, directionCorrect, wrong, groupPredictions.length, exactPoints);

    // Build group-scoped predRows (sorted: exact → direction → miss → no pick)
    const predRows: PredRow[] = groupPredictions
      .map((pred) => {
        const result = calculatePoints(pred.homeScore, pred.awayScore, homeScore, awayScore, exactPoints, directionPoints);
        return {
          name: pred.user.name ?? pred.user.email ?? "Anonymous",
          predHomeScore: pred.homeScore,
          predAwayScore: pred.awayScore,
          points: result.points,
          isExact: result.exact,
          isDirection: result.direction && !result.exact,
          hasPrediction: true,
        } as PredRow;
      })
      .sort((a, b) => {
        if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
        if (a.isDirection !== b.isDirection) return a.isDirection ? -1 : 1;
        return b.points - a.points;
      });

    // Fetch group members for leaderboard + to add non-predictors to predRows
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailNotifications: true,
            emailPostGame: true,
            isDemo: true,
            predictions: { where: { points: { not: null }, groupId }, select: { points: true } },
            customPredictionAnswers: { where: { points: { not: null }, groupId }, select: { points: true } },
            advancementPredictions: { where: { points: { not: null }, groupId }, select: { points: true } },
          },
        },
      },
    });

    // Add group members who didn't predict this match to predRows (no-pick rows)
    for (const m of memberships) {
      if (!predictedUserIds.has(m.user.id) && !m.user.isDemo) {
        predRows.push({
          name: m.user.name ?? m.user.email ?? "Anonymous",
          predHomeScore: null,
          predAwayScore: null,
          points: 0,
          isExact: false,
          isDirection: false,
          hasPrediction: false,
        });
      }
    }

    // Build group-scoped leaderboard
    const leaderboard = memberships
      .filter((m) => !m.user.isDemo)
      .map((m) => {
        const allPts = [
          ...m.user.predictions.map((p) => p.points ?? 0),
          ...m.user.customPredictionAnswers.map((p) => p.points ?? 0),
          ...m.user.advancementPredictions.map((p) => p.points ?? 0),
        ];
        return {
          id: m.user.id,
          name: m.user.name ?? m.user.email ?? "Anonymous",
          email: m.user.email,
          emailNotifications: m.user.emailNotifications,
          emailPostGame: m.user.emailPostGame,
          totalPoints: allPts.reduce((s, p) => s + p, 0),
          pointsGained: pointsGainedMap[m.user.id] ?? 0,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    const top3 = leaderboard.slice(0, 3);
    const pushBody = buildPushBody(insights, top3);

    await Promise.allSettled(
      leaderboard.map(async (entry) => {
        // Email
        try {
          if (entry.email && entry.emailNotifications && entry.emailPostGame) {
            await sendPostGameEmail(
              entry.email,
              entry.name,
              { homeTeam: match.homeTeam, awayTeam: match.awayTeam, homeScore, awayScore },
              insights,
              top3,
              predRows,
              entry.rank > 3 ? entry : undefined
            );
          }
        } catch { /* non-fatal */ }

        // Push
        await sendPushToUser(entry.id, {
          title: `⚽ Result: ${matchLabel}`,
          body: pushBody,
          url: "/groups",
          tag: `result-${matchId}`,
        });
      })
    );
  }

  // ── Create dedup sentinel so score corrections don't re-fire the email blast ─
  // We use "post_game_email" type (never shown in NotificationCenter UI).
  if (allPredictions.length > 0) {
    await prisma.notification.create({
      data: {
        userId: allPredictions[0].userId,
        type: "post_game_email",
        title: "__email_sent__",
        body: matchLabel,
        matchId,
        read: true,
      },
    }).catch(() => { /* non-fatal */ });
  }
}

function buildInsights(
  exactScorers: string[],
  directionCorrect: string[],
  wrong: string[],
  totalPredictions: number,
  exactPoints: number
): { emoji: string; text: string }[] {
  const insights: { emoji: string; text: string }[] = [];
  if (exactScorers.length === 0 && directionCorrect.length === 0) {
    insights.push({ emoji: "😅", text: "Nobody predicted this result correctly!" });
  } else {
    if (exactScorers.length > 0) {
      if (exactScorers.length === 1) {
        insights.push({ emoji: "🔮", text: `${exactScorers[0]} was the only one to get the exact score!` });
      } else if (exactScorers.length === totalPredictions) {
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
    if (totalPredictions === 0) {
      insights.push({ emoji: "📭", text: "No predictions were submitted for this match" });
    }
  }
  return insights;
}

// ── Group Admin action notification to admin ────────────────────────────────────

export async function notifyAdminOfSubAdminAction(
  actorName: string,
  action: "score_update" | "prediction_update",
  details: {
    matchId: string;
    matchHomeTeam: string;
    matchAwayTeam: string;
    matchNumber: number;
    newHomeScore: number;
    newAwayScore: number;
    prevHomeScore?: number | null;
    prevAwayScore?: number | null;
    targetUserName?: string;
  }
) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  try {
    await sendSubAdminActionEmail(adminEmail, actorName, action, details);
  } catch (e) {
    console.error("[notifications] sub-admin action email failed:", e);
  }

  const adminUser = await prisma.user.findFirst({
    where: { email: adminEmail },
    select: { id: true },
  });

  if (adminUser) {
    const label = action === "score_update" ? "updated a score" : "edited a prediction";
    try {
      await sendPushToUser(adminUser.id, {
        title: "Group Admin action",
        body: `${actorName} ${label}: ${details.matchHomeTeam} vs ${details.matchAwayTeam}`,
        url: "/admin",
        tag: "subadmin-action",
      });
    } catch (e) {
      console.error("[notifications] sub-admin push failed:", e);
    }
  }
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
