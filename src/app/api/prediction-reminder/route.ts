import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";
import { ADVANCEMENT_LOCK_TIME } from "@/lib/wcGroups";
import { isAdvancementLocked } from "@/lib/advancementLock";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const now = getNow();

  const memberships = await prisma.groupMembership.findMany({
    where: { userId, status: "APPROVED" },
    select: { groupId: true },
    orderBy: { createdAt: "asc" },
  });
  const groupIds = memberships.map((m) => m.groupId);

  if (groupIds.length === 0) {
    return NextResponse.json({ hasAnything: false });
  }

  const primaryGroupId = groupIds[0];

  const [globalPreds, userGlobalAnswers, advPickGroups, advLocked] = await Promise.all([
    prisma.customPrediction.findMany({
      where: { isGlobal: true, status: "OPEN", lockTime: { gt: now } },
      select: { id: true, lockTime: true },
      orderBy: { lockTime: "asc" },
    }),
    prisma.customPredictionAnswer.findMany({
      where: { userId, customPrediction: { isGlobal: true } },
      select: { customPredictionId: true },
      distinct: ["customPredictionId"],
    }),
    prisma.advancementPrediction.groupBy({
      by: ["groupId"],
      where: { userId, groupId: { in: groupIds } },
      _count: { id: true },
    }),
    isAdvancementLocked(),
  ]);

  const answeredIds = new Set(userGlobalAnswers.map((a) => a.customPredictionId));
  const unfilledGlobal = globalPreds.filter((p) => !answeredIds.has(p.id));

  const picksByGroup = new Map(advPickGroups.map((r) => [r.groupId, r._count.id]));
  const incompleteAdvancementGroupCount = advLocked
    ? 0
    : groupIds.filter((gid) => (picksByGroup.get(gid) ?? 0) < 32).length;

  const hasAnything = unfilledGlobal.length > 0 || incompleteAdvancementGroupCount > 0;

  return NextResponse.json({
    hasAnything,
    unfilledGlobalCount: unfilledGlobal.length,
    earliestGlobalLockTime: unfilledGlobal[0]?.lockTime.toISOString() ?? null,
    incompleteAdvancementGroupCount,
    advancementLockTime: ADVANCEMENT_LOCK_TIME.toISOString(),
    advancementLocked: advLocked,
    primaryGroupId,
    serverNowMs: now.getTime(),
  });
}
