import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePoints, getPointsForRound, isPredictionLocked } from "@/lib/scoring";
import { notifyAdminOfSubAdminAction } from "@/lib/notifications";

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

  // Immutability: predictions lock 1 hour before kickoff and cannot be changed after
  if (isPredictionLocked(match.kickoff)) {
    return NextResponse.json(
      { error: "Predictions for this match are locked and cannot be changed" },
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

  const prediction = await prisma.prediction.upsert({
    where: { userId_matchId_groupId: { userId, matchId, groupId } },
    update: { homeScore, awayScore, points },
    create: { userId, matchId, groupId, homeScore, awayScore, points },
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
