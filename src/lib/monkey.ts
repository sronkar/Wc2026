import { prisma } from "./prisma";

const GOAL_WEIGHTS = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4];

function randomGoals(): number {
  return GOAL_WEIGHTS[Math.floor(Math.random() * GOAL_WEIGHTS.length)];
}

export async function ensureMonkeyUser(): Promise<string> {
  let monkey = await prisma.user.findFirst({ where: { email: "monkey@wc2026.internal" } });
  if (!monkey) {
    monkey = await prisma.user.create({
      data: {
        name: "🐒 Monkey",
        email: "monkey@wc2026.internal",
        role: "USER",
        isDemo: true,
      },
    });
  }
  return monkey.id;
}

export async function addMonkeyToGroup(groupId: string): Promise<void> {
  const monkeyId = await ensureMonkeyUser();

  // Add as approved member (skip if already exists)
  await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId: monkeyId, groupId } },
    update: {},
    create: { userId: monkeyId, groupId, status: "APPROVED", memberRole: "MEMBER" },
  });

  // Generate predictions for all group stage matches that don't already exist.
  // We also prune any monkey predictions that point at a matchId no longer in
  // the current Group Stage set — that handles the case where the match table
  // was wiped and re-seeded with new IDs (e.g., demo reset, schema migration).
  // Without this prune, the leaderboard would show monkey points against
  // dangling matches.
  const matches = await prisma.match.findMany({
    where: { round: "Group Stage" },
    select: { id: true },
  });
  const validMatchIds = new Set(matches.map((m) => m.id));

  const existing = await prisma.prediction.findMany({
    where: { userId: monkeyId, groupId },
    select: { id: true, matchId: true },
  });
  const stale = existing.filter((p) => !validMatchIds.has(p.matchId)).map((p) => p.id);
  if (stale.length > 0) {
    await prisma.prediction.deleteMany({ where: { id: { in: stale } } });
  }

  const existingIds = new Set(
    existing.filter((p) => validMatchIds.has(p.matchId)).map((p) => p.matchId)
  );
  const toCreate = matches.filter((m) => !existingIds.has(m.id));
  if (toCreate.length === 0) return;

  await prisma.prediction.createMany({
    data: toCreate.map((m) => ({
      userId: monkeyId,
      matchId: m.id,
      groupId,
      homeScore: randomGoals(),
      awayScore: randomGoals(),
    })),
  });
}
