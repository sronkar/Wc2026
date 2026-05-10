import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGroupAdminAccess } from "@/lib/authz";

const KNOCKOUT_ROUNDS = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Third Place Play-off", "Final"];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [
    members,
    allMatches,
    allPredictions,
    customPredictions,
    customAnswers,
    advancementPredictions,
  ] = await Promise.all([
    prisma.groupMembership.findMany({
      where: { groupId: params.id, status: "APPROVED" },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.match.findMany({ select: { id: true, round: true, homeTeam: true } }),
    prisma.prediction.findMany({
      where: { groupId: params.id },
      select: { userId: true, matchId: true },
    }),
    prisma.customPrediction.findMany({
      where: {
        status: { not: "DISABLED" },
        OR: [{ isGlobal: true }, { groupId: params.id }],
      },
      select: { id: true },
    }),
    prisma.customPredictionAnswer.findMany({
      where: {
        groupId: params.id,
        customPrediction: {
          status: { not: "DISABLED" },
          OR: [{ isGlobal: true }, { groupId: params.id }],
        },
      },
      select: { userId: true, customPredictionId: true },
    }),
    prisma.advancementPrediction.findMany({
      where: { groupId: params.id },
      select: { userId: true, team: true },
    }),
  ]);

  const groupStageMatchIds = new Set(allMatches.filter((m) => m.round === "Group Stage").map((m) => m.id));
  const knockoutMatchIds = new Set(allMatches.filter((m) => KNOCKOUT_ROUNDS.includes(m.round)).map((m) => m.id));
  const customPredictionIds = new Set(customPredictions.map((cp) => cp.id));

  // Knockout is "available" only when at least one match has a real (non-placeholder) team
  const knockoutAvailable = allMatches.some(
    (m) => KNOCKOUT_ROUNDS.includes(m.round) && !/^(Winner|Runner-?up|TBD)\s*/i.test(m.homeTeam ?? "")
  );

  // 12 group winners + 12 runner-ups + 8 best-third-place = 32 picks
  const totalAdvancement = 32;

  const totals = {
    matchGroupStage: groupStageMatchIds.size,
    matchKnockout: knockoutMatchIds.size,
    customPredictions: customPredictionIds.size,
    advancementPicks: totalAdvancement,
  };

  const availability = {
    matchGroupStage: groupStageMatchIds.size > 0,
    matchKnockout: knockoutAvailable,
    customPredictions: customPredictionIds.size > 0,
    advancementPicks: true,
  };

  const stats = members.map((m) => {
    const uid = m.user.id;

    // Match predictions this user submitted in this group
    const userPreds = allPredictions.filter((p) => p.userId === uid);
    const groupStageDone = userPreds.filter((p) => groupStageMatchIds.has(p.matchId)).length;
    const knockoutDone = userPreds.filter((p) => knockoutMatchIds.has(p.matchId)).length;

    // Custom prediction answers
    const userCustom = customAnswers.filter((a) => a.userId === uid && customPredictionIds.has(a.customPredictionId));
    const customDone = userCustom.length;

    // Advancement predictions (unique teams)
    const advDone = advancementPredictions.filter((a) => a.userId === uid).length;

    return {
      userId: uid,
      userName: m.user.name ?? "Anonymous",
      userImage: m.user.image,
      memberRole: m.memberRole,
      matchGroupStage: groupStageDone,
      matchKnockout: knockoutDone,
      customPredictions: customDone,
      advancementPicks: advDone,
    };
  });

  return NextResponse.json({ stats, totals, availability });
}
