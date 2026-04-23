import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";
import { sendPushToUser } from "@/lib/webpush";
import { sendLock30mEmail } from "@/lib/email";

export async function generateLockNotifications() {
  const now = getNow();

  // lock_1h: kickoff 100–140 min away → lock ~60 min away
  const w1Start = new Date(now.getTime() + 100 * 60 * 1000);
  const w1End   = new Date(now.getTime() + 140 * 60 * 1000);

  // lock_30m: kickoff 70–110 min away → lock ~30 min away
  const w2Start = new Date(now.getTime() + 70 * 60 * 1000);
  const w2End   = new Date(now.getTime() + 110 * 60 * 1000);

  const [w1Matches, w2Matches] = await Promise.all([
    prisma.match.findMany({ where: { status: "SCHEDULED", kickoff: { gte: w1Start, lte: w1End } } }),
    prisma.match.findMany({ where: { status: "SCHEDULED", kickoff: { gte: w2Start, lte: w2End } } }),
  ]);

  if (w1Matches.length === 0 && w2Matches.length === 0) return;

  const allMatchIdsSet = new Set([...w1Matches.map((m) => m.id), ...w2Matches.map((m) => m.id)]);
  const allMatchIds = Array.from(allMatchIdsSet);
  const w2MatchIds = w2Matches.map((m) => m.id);

  const [users, existing, predictions] = await Promise.all([
    // Only notify users who are approved members of at least one group
    prisma.user.findMany({
      where: { isDemo: false, groupMemberships: { some: { status: "APPROVED" } } },
      select: { id: true },
    }),
    prisma.notification.findMany({
      where: { matchId: { in: allMatchIds }, type: { in: ["lock_1h", "lock_30m"] } },
      select: { userId: true, matchId: true, type: true },
    }),
    // Load predictions for ALL upcoming matches (both lock_1h and lock_30m windows)
    // so we can skip notifications for users who already predicted
    prisma.prediction.findMany({
      where: { matchId: { in: allMatchIds } },
      select: { userId: true, matchId: true },
    }),
  ]);

  const existingSet = new Set(existing.map((n) => `${n.userId}:${n.matchId}:${n.type}`));
  const predictedSet = new Set(predictions.map((p) => `${p.userId}:${p.matchId}`));

  const toCreate: Array<{
    userId: string; type: string; matchId: string; title: string; body: string;
  }> = [];

  for (const user of users) {
    for (const match of w1Matches) {
      if (existingSet.has(`${user.id}:${match.id}:lock_1h`)) continue;
      if (predictedSet.has(`${user.id}:${match.id}`)) continue; // already predicted
      toCreate.push({
        userId: user.id,
        type: "lock_1h",
        matchId: match.id,
        title: "Predictions lock in ~1 hour",
        body: `${match.homeTeam} vs ${match.awayTeam} — get your prediction in!`,
      });
    }

    for (const match of w2Matches) {
      if (existingSet.has(`${user.id}:${match.id}:lock_30m`)) continue;
      if (predictedSet.has(`${user.id}:${match.id}`)) continue;
      toCreate.push({
        userId: user.id,
        type: "lock_30m",
        matchId: match.id,
        title: "Last chance — 30 min to lock",
        body: `${match.homeTeam} vs ${match.awayTeam} — you haven't predicted yet!`,
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.notification.createMany({ data: toCreate });

    const lock30mItems = toCreate.filter((n) => n.type === "lock_30m");

    // Send push for lock_30m to users who haven't predicted
    const pushPromises = lock30mItems.map((n) =>
      sendPushToUser(n.userId, {
        title: n.title,
        body: n.body,
        url: "/groups",
        tag: `lock-30m-${n.matchId}`,
      }).catch(() => {/* non-fatal */})
    );
    await Promise.allSettled(pushPromises);

    // Send email for lock_30m to users with emailNotifications enabled
    if (lock30mItems.length > 0) {
      const userIds = Array.from(new Set(lock30mItems.map((n) => n.userId)));
      const emailUsers = await prisma.user.findMany({
        where: { id: { in: userIds }, email: { not: null }, emailNotifications: true, isDemo: { not: true } },
        select: { id: true, email: true, name: true },
      });
      const emailMap: Record<string, typeof emailUsers[0]> = {};
      for (const u of emailUsers) emailMap[u.id] = u;

      const emailPromises = userIds.map(async (userId) => {
        const user = emailMap[userId];
        if (!user?.email) return;
        const userMatches = lock30mItems
          .filter((n) => n.userId === userId)
          .map((n) => w2Matches.find((m) => m.id === n.matchId))
          .filter(Boolean) as typeof w2Matches;
        if (userMatches.length === 0) return;
        try {
          await sendLock30mEmail(user.email, user.name ?? "Predictor", userMatches);
        } catch { /* non-fatal */ }
      });
      await Promise.allSettled(emailPromises);
    }
  }
}

export async function generateResultNotification(
  userId: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  points: number,
  isExact: boolean
) {
  const exists = await prisma.notification.findFirst({
    where: { userId, type: "result", matchId },
  });
  if (exists) return;

  const matchLabel = `${homeTeam} ${homeScore}–${awayScore} ${awayTeam}`;

  let title: string;
  let body: string;

  if (isExact) {
    title = `Exact score! +${points} pts`;
    body = matchLabel;
  } else if (points > 0) {
    title = `+${points} pts — right result`;
    body = matchLabel;
  } else {
    title = `Miss — ${matchLabel}`;
    body = "Better luck next time.";
  }

  await prisma.notification.create({
    data: { userId, type: "result", matchId, title, body },
  });
}
