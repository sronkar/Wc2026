import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN") {
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: session.user.id, groupId } },
    });
    if (membership?.status !== "APPROVED") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          predictions: {
            where: { points: { not: null }, groupId },
            select: { points: true },
          },
        },
      },
    },
  });

  const leaderboard = memberships
    .map((m) => {
      const totalPoints = m.user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
      const directHits = m.user.predictions.filter((p) => (p.points ?? 0) > 0).length;
      return {
        id: m.user.id,
        name: m.user.name ?? "Anonymous",
        image: m.user.image,
        totalPoints,
        directHits,
        predictionsCount: m.user.predictions.length,
      };
    })
    .sort((a, b) =>
      b.totalPoints !== a.totalPoints ? b.totalPoints - a.totalPoints :
      b.directHits !== a.directHits ? b.directHits - a.directHits :
      b.predictionsCount - a.predictionsCount
    )
    .map((u, i) => ({ ...u, rank: i + 1 }));

  return NextResponse.json(leaderboard);
}
