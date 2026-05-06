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

  const w1Set = new Set(w1Matches.map((m) => m.id));
  const w2Set = new Set(w2Matches.map((m) => m.id));
  const allMatches = [...w1Matches, ...w2Matches.filter((m) => !w1Set.has(m.id))];
  const allMatchIds = allMatches.map((m) => m.id);

  // Users with their approved, predictor-eligible group memberships.
  // Per-group reminder logic: a user is reminded about a match for each of their
  // groups where a prediction hasn't been submitted yet.
  const [users, existing, predictions] = await Promise.all([
    prisma.user.findMany({
      where: {
        isDemo: false,
        groupMemberships: { some: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } } },
      },
      select: {
        id: true, email: true, name: true, emailNotifications: true,
        groupMemberships: {
          where: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
          select: { groupId: true, group: { select: { name: true } } },
        },
      },
    }),
    prisma.notification.findMany({
      where: { matchId: { in: allMatchIds }, type: { in: ["lock_1h", "lock_30m"] } },
      select: { userId: true, matchId: true, type: true },
    }),
    prisma.prediction.findMany({
      where: { matchId: { in: allMatchIds } },
      select: { userId: true, matchId: true, groupId: true },
    }),
  ]);

  const existingSet = new Set(existing.map((n) => `${n.userId}:${n.matchId}:${n.type}`));
  // (userId, matchId, groupId) — tracks which specific group each prediction covers
  const predictedSet = new Set(predictions.map((p) => `${p.userId}:${p.matchId}:${p.groupId}`));

  const toCreate: Array<{
    userId: string; type: string; matchId: string; title: string; body: string; groupIds: string;
  }> = [];
  // For lock_30m: { userId, user email/name/prefs, match, groupNames[] }
  const lock30mTargets: Array<{
    userId: string; email: string | null; name: string | null; emailNotifications: boolean;
    match: typeof allMatches[number]; groupNames: string[];
  }> = [];

  function describeGroups(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }

  for (const user of users) {
    const userGroups = user.groupMemberships.map((gm) => ({ id: gm.groupId, name: gm.group.name }));
    if (userGroups.length === 0) continue;

    for (const match of allMatches) {
      const unpredictedGroups = userGroups.filter(
        (g) => !predictedSet.has(`${user.id}:${match.id}:${g.id}`)
      );
      if (unpredictedGroups.length === 0) continue;

      const allOpen = unpredictedGroups.length === userGroups.length;
      const groupPhrase = describeGroups(unpredictedGroups.map((g) => g.name));
      const groupIdsJson = JSON.stringify(unpredictedGroups.map((g) => g.id));

      if (w1Set.has(match.id) && !existingSet.has(`${user.id}:${match.id}:lock_1h`)) {
        toCreate.push({
          userId: user.id,
          type: "lock_1h",
          matchId: match.id,
          groupIds: groupIdsJson,
          title: "Predictions lock in ~1 hour",
          body: allOpen
            ? `${match.homeTeam} vs ${match.awayTeam} — get your prediction in!`
            : `${match.homeTeam} vs ${match.awayTeam} — still open in ${groupPhrase}.`,
        });
      }

      if (w2Set.has(match.id) && !existingSet.has(`${user.id}:${match.id}:lock_30m`)) {
        const body = allOpen
          ? `${match.homeTeam} vs ${match.awayTeam} — you haven't predicted yet!`
          : `${match.homeTeam} vs ${match.awayTeam} — still open in ${groupPhrase}.`;
        toCreate.push({
          userId: user.id,
          type: "lock_30m",
          matchId: match.id,
          groupIds: groupIdsJson,
          title: "Last chance — 30 min to lock",
          body,
        });
        lock30mTargets.push({
          userId: user.id,
          email: user.email,
          name: user.name,
          emailNotifications: user.emailNotifications,
          match,
          groupNames: unpredictedGroups.map((g) => g.name),
        });
      }
    }
  }

  if (toCreate.length === 0) return;

  await prisma.notification.createMany({ data: toCreate });

  // Push for lock_30m — one per (user, match) with the unpredicted group(s) in the body
  await Promise.allSettled(
    lock30mTargets.map((t) => {
      const body = t.groupNames.length === 1
        ? `${t.match.homeTeam} vs ${t.match.awayTeam} (${t.groupNames[0]})`
        : `${t.match.homeTeam} vs ${t.match.awayTeam} — open in ${t.groupNames.length} group${t.groupNames.length === 1 ? "" : "s"}`;
      return sendPushToUser(t.userId, {
        title: "Last chance — 30 min to lock",
        body,
        url: "/groups",
        tag: `lock-30m-${t.match.id}`,
      }).catch(() => { /* non-fatal */ });
    })
  );

  // Email for lock_30m — aggregate matches per user
  const byUser = new Map<string, { email: string; name: string | null; matches: typeof allMatches }>();
  for (const t of lock30mTargets) {
    if (!t.email || !t.emailNotifications) continue;
    const entry = byUser.get(t.userId) ?? { email: t.email, name: t.name, matches: [] };
    if (!entry.matches.find((m) => m.id === t.match.id)) entry.matches.push(t.match);
    byUser.set(t.userId, entry);
  }
  await Promise.allSettled(
    Array.from(byUser.values()).map(async (u) => {
      try { await sendLock30mEmail(u.email, u.name ?? "Predictor", u.matches); }
      catch { /* non-fatal */ }
    })
  );
}

export async function generateResultNotification(
  userId: string,
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  // Total points across every group the user predicted in.
  points: number,
  // Number of groups in which the score was exact (0 if none).
  exactCount: number,
  // Total number of groups the user predicted in for this match.
  groupCount: number,
  groupIds?: string[],
) {
  const exists = await prisma.notification.findFirst({
    where: { userId, type: "result", matchId },
  });
  if (exists) return;

  const matchLabel = `${homeTeam} ${homeScore}–${awayScore} ${awayTeam}`;
  // Only annotate cross-group totals when the user predicted in >1 group, so
  // the common (single-group) case stays terse.
  const groupSuffix = groupCount > 1 ? ` across ${groupCount} groups` : "";

  let title: string;
  let body: string;

  if (exactCount === groupCount && exactCount > 0) {
    // All-groups exact
    title = `Exact score! +${points} pts${groupSuffix}`;
    body = matchLabel;
  } else if (exactCount > 0) {
    // Partial exact (some groups exact, others direction-only)
    title = `Exact in ${exactCount}/${groupCount} groups — +${points} pts`;
    body = matchLabel;
  } else if (points > 0) {
    title = `+${points} pts — right result${groupSuffix}`;
    body = matchLabel;
  } else {
    title = `Miss — ${matchLabel}`;
    body = "Better luck next time.";
  }

  await prisma.notification.create({
    data: {
      userId, type: "result", matchId, title, body,
      groupIds: groupIds && groupIds.length > 0 ? JSON.stringify(groupIds) : null,
    },
  });
}
