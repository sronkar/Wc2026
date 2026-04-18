import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePoints } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { matchId, homeScore, awayScore } = await req.json();

  if (typeof homeScore !== "number" || typeof awayScore !== "number") {
    return NextResponse.json({ error: "Invalid scores" }, { status: 400 });
  }

  const settings = await prisma.pointSettings.findUnique({
    where: { id: "default" },
  });
  const exactPts = settings?.exactMatchPoints ?? 5;
  const directionPts = settings?.directionMatchPoints ?? 1;

  // Update the match result
  const match = await prisma.match.update({
    where: { id: matchId },
    data: { homeScore, awayScore, status: "FINISHED" },
  });

  // Recalculate points for all predictions on this match
  const predictions = await prisma.prediction.findMany({
    where: { matchId },
  });

  for (const pred of predictions) {
    const result = calculatePoints(
      pred.homeScore,
      pred.awayScore,
      homeScore,
      awayScore,
      exactPts,
      directionPts
    );
    await prisma.prediction.update({
      where: { id: pred.id },
      data: { points: result.points },
    });
  }

  return NextResponse.json({ match, predictionsUpdated: predictions.length });
}
