import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { matchId: string } }
) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!session?.user || (role !== "ADMIN" && role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const predictions = await prisma.prediction.findMany({
    where: { matchId: params.matchId },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return NextResponse.json(
    predictions.map((p) => ({
      id: p.id,
      userId: p.userId,
      userName: p.user.name ?? "Anonymous",
      userImage: p.user.image,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
      points: p.points,
    }))
  );
}
