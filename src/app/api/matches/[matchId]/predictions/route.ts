import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";

export async function GET(
  req: NextRequest,
  { params }: { params: { matchId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const match = await prisma.match.findUnique({ where: { id: params.matchId } });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only reveal predictions once locked or finished
  const locked = isPredictionLocked(match.kickoff);
  if (!locked && match.status !== "FINISHED") {
    return NextResponse.json([]);
  }

  const predictions = await prisma.prediction.findMany({
    where: { matchId: params.matchId },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return NextResponse.json(
    predictions.map((p) => ({
      userId: p.userId,
      userName: p.user.name ?? "Anonymous",
      userImage: p.user.image,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
      points: p.points,
      isCurrentUser: p.userId === session.user.id,
    }))
  );
}
