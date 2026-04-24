import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";
import { loadVirtualTime } from "@/lib/time";

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
    awayScore < 0 ||
    homeScore > 20 ||
    awayScore > 20 ||
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore)
  ) {
    return NextResponse.json({ error: "Scores must be whole numbers between 0 and 20" }, { status: 400 });
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

  await loadVirtualTime();

  // Lock re-check + upsert run inside a single transaction so we can't race
  // the lock threshold between the check and the write. SQLite serialises
  // writes, so concurrent upserts for this (userId, matchId, groupId) also
  // queue behind each other.
  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) return { status: 404 as const, body: { error: "Match not found" } };
    if (isPredictionLocked(match.kickoff)) {
      return {
        status: 403 as const,
        body: { error: "Predictions are locked (< 1 hour before kickoff)" },
      };
    }
    const prediction = await tx.prediction.upsert({
      where: { userId_matchId_groupId: { userId: session.user.id, matchId, groupId } },
      update: { homeScore, awayScore, points: null },
      create: { userId: session.user.id, matchId, groupId, homeScore, awayScore },
    });
    return { status: 200 as const, body: prediction };
  });

  return NextResponse.json(result.body, { status: result.status });
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

  await loadVirtualTime();

  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) return { status: 404 as const, body: { error: "Match not found" } };
    if (isPredictionLocked(match.kickoff)) {
      return { status: 403 as const, body: { error: "Predictions are locked" } };
    }
    await tx.prediction.deleteMany({
      where: { userId: session.user.id, matchId, groupId },
    });
    return { status: 200 as const, body: { ok: true } };
  });

  return NextResponse.json(result.body, { status: result.status });
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
