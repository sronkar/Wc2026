import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId, homeScore, awayScore } = await req.json();

  if (
    typeof homeScore !== "number" ||
    typeof awayScore !== "number" ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return NextResponse.json({ error: "Invalid scores" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (isPredictionLocked(match.kickoff)) {
    return NextResponse.json(
      { error: "Predictions are locked (< 1 hour before kickoff)" },
      { status: 403 }
    );
  }

  const prediction = await prisma.prediction.upsert({
    where: { userId_matchId: { userId: session.user.id, matchId } },
    update: { homeScore, awayScore, points: null },
    create: { userId: session.user.id, matchId, homeScore, awayScore },
  });

  return NextResponse.json(prediction);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  const where = matchId
    ? { userId: session.user.id, matchId }
    : { userId: session.user.id };

  const predictions = await prisma.prediction.findMany({
    where,
    include: { match: true },
    orderBy: { match: { kickoff: "asc" } },
  });

  return NextResponse.json(predictions);
}
