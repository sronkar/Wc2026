import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePoints, getPointsForRound, isPredictionLocked } from "@/lib/scoring";
import { notifyAdminOfSubAdminAction } from "@/lib/notifications";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!session?.user || (role !== "ADMIN" && role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, matchId, groupId, homeScore, awayScore } = await req.json();
  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });

  if (typeof homeScore !== "number" || typeof awayScore !== "number") {
    return NextResponse.json({ error: "Invalid scores" }, { status: 400 });
  }

  const [match, targetUser] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
  ]);

  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Lock policy:
  // - Pre-lock (the normal window): admin may edit any user's prediction.
  // - Post-lock: admin may edit *another* user's prediction on the user's
  //   request, but NOT their own — otherwise an admin could rewrite their own
  //   pick after seeing how the match unfolded. Every edit (locked or not)
  //   writes to AdminAuditLog below so post-lock overrides are visible to
  //   anyone reviewing the audit trail.
  if (isPredictionLocked(match.kickoff) && userId === session.user.id) {
    return NextResponse.json(
      { error: "Your own prediction is locked and cannot be changed" },
      { status: 409 }
    );
  }

  let points: number | null = null;
  if (match.status === "FINISHED" && match.homeScore !== null && match.awayScore !== null) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { exactMatchPoints: true, directionMatchPoints: true, stagePoints: true },
    });
    const { exact: exactPts, direction: dirPts } = getPointsForRound(
      group?.stagePoints ?? "{}", match.round, group?.exactMatchPoints ?? 2, group?.directionMatchPoints ?? 1
    );
    const result = calculatePoints(homeScore, awayScore, match.homeScore, match.awayScore, exactPts, dirPts);
    points = result.points;
  }

  const prior = await prisma.prediction.findUnique({
    where: { userId_matchId_groupId: { userId, matchId, groupId } },
    select: { homeScore: true, awayScore: true },
  });

  const prediction = await prisma.prediction.upsert({
    where: { userId_matchId_groupId: { userId, matchId, groupId } },
    update: { homeScore, awayScore, points },
    create: { userId, matchId, groupId, homeScore, awayScore, points },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    action: prior ? "prediction.edit" : "prediction.create",
    targetType: "prediction",
    targetId: prediction.id,
    before: prior ? { homeScore: prior.homeScore, awayScore: prior.awayScore } : undefined,
    after: { homeScore, awayScore, points },
    context: `${match.homeTeam} vs ${match.awayTeam} (#${match.matchNumber}) for user ${targetUser.name ?? userId} in group ${groupId}`,
  });

  if (role === "SUB_ADMIN") {
    notifyAdminOfSubAdminAction(
      session.user.name ?? "Sub-admin",
      "prediction_update",
      {
        matchId,
        matchHomeTeam: match.homeTeam,
        matchAwayTeam: match.awayTeam,
        matchNumber: match.matchNumber,
        newHomeScore: homeScore,
        newAwayScore: awayScore,
        targetUserName: targetUser.name ?? "Unknown",
      }
    ).catch((e) => console.error("[notifications] sub-admin notify failed:", e));
  }

  return NextResponse.json(prediction);
}
