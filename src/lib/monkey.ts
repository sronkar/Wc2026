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

  // Generate predictions for all group stage matches that don't already exist
  const matches = await prisma.match.findMany({
    where: { round: "Group Stage" },
    select: { id: true },
  });

  const existing = await prisma.prediction.findMany({
    where: { userId: monkeyId, groupId },
    select: { matchId: true },
  });
  const existingIds = new Set(existing.map((p) => p.matchId));

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
