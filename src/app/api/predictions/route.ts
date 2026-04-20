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

  const { matchId, groupId, homeScore, awayScore } = await req.json();

  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });

  if (
    typeof homeScore !== "number" ||
    typeof awayScore !== "number" ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return NextResponse.json({ error: "Invalid scores" }, { status: 400 });
  }

  // Verify user is an approved member of this group (not a visitor admin)
  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (membership?.status !== "APPROVED") {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }
  if (membership.memberRole === "VISITOR_ADMIN") {
    return NextResponse.json({ error: "Visitor admins cannot submit predictions" }, { status: 403 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  if (isPredictionLocked(match.kickoff)) {
    return NextResponse.json(
      { error: "Predictions are locked (< 1 hour before kickoff)" },
      { status: 403 }
    );
  }

  const prediction = await prisma.prediction.upsert({
    where: { userId_matchId_groupId: { userId: session.user.id, matchId, groupId } },
    update: { homeScore, awayScore, points: null },
    create: { userId: session.user.id, matchId, groupId, homeScore, awayScore },
  });

  return NextResponse.json(prediction);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");
  const groupId = searchParams.get("groupId");
  if (!matchId || !groupId) {
    return NextResponse.json({ error: "matchId and groupId are required" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  if (isPredictionLocked(match.kickoff)) {
    return NextResponse.json({ error: "Predictions are locked" }, { status: 403 });
  }

  await prisma.prediction.deleteMany({
    where: { userId: session.user.id, matchId, groupId },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");
  const groupId = searchParams.get("groupId");

  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });

  const where: Record<string, unknown> = { userId: session.user.id, groupId };
  if (matchId) where.matchId = matchId;

  const predictions = await prisma.prediction.findMany({
    where,
    include: { match: true },
    orderBy: { match: { kickoff: "asc" } },
  });

  return NextResponse.json(predictions);
}
