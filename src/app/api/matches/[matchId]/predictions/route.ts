import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";
import { loadVirtualTime } from "@/lib/time";

export async function GET(
  req: NextRequest,
  { params }: { params: { matchId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });

  const match = await prisma.match.findUnique({ where: { id: params.matchId } });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await loadVirtualTime();
  const locked = isPredictionLocked(match.kickoff);
  if (!locked && match.status !== "FINISHED") return NextResponse.json([]);

  const predictions = await prisma.prediction.findMany({
    where: { matchId: params.matchId, groupId },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const result = predictions.map((p) => ({
    userId: p.userId,
    userName: p.user.name ?? "Anonymous",
    userImage: p.user.image,
    homeScore: p.homeScore,
    awayScore: p.awayScore,
    points: p.points,
    isCurrentUser: p.userId === session.user.id,
  }));

  if (match.status === "FINISHED") {
    result.sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.userName.localeCompare(b.userName));
  }

  return NextResponse.json(result);
}
