import { prisma } from "./prisma";

export async function ensureClaudioUser(): Promise<string> {
  const claudio = await prisma.user.upsert({
    where: { email: "claudio@wc2026.internal" },
    update: {},
    create: { name: "🧠 Claudio", email: "claudio@wc2026.internal", role: "USER", isDemo: true },
    select: { id: true },
  });
  return claudio.id;
}

export async function addClaudioToGroup(groupId: string): Promise<void> {
  const claudioId = await ensureClaudioUser();

  await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId: claudioId, groupId } },
    update: {},
    create: { userId: claudioId, groupId, status: "APPROVED", memberRole: "MEMBER" },
  });

  // Copy any AI-generated predictions Claudio already has into this new group
  const existingPredictions = await prisma.prediction.findMany({
    where: { userId: claudioId },
    select: { matchId: true, homeScore: true, awayScore: true },
    distinct: ["matchId"],
  });
  if (existingPredictions.length === 0) return;

  const alreadyInGroup = await prisma.prediction.findMany({
    where: { userId: claudioId, groupId },
    select: { matchId: true },
  });
  const alreadyIds = new Set(alreadyInGroup.map((p) => p.matchId));

  const toCreate = existingPredictions.filter((p) => !alreadyIds.has(p.matchId));
  if (toCreate.length === 0) return;

  await prisma.prediction.createMany({
    data: toCreate.map((p) => ({
      userId: claudioId,
      matchId: p.matchId,
      groupId,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
    })),
  });
}
