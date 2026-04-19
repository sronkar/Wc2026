import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const role = session.user.role;
  const groupId = params.id;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        where: { status: "APPROVED" },
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
      },
    },
  });

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdminRole = role === "ADMIN" || role === "SUB_ADMIN";
  const myMembership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });

  if (!isAdminRole && myMembership?.status !== "APPROVED") {
    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      avatar: group.avatar,
      myStatus: myMembership?.status ?? null,
      leaderboard: null,
    });
  }

  const leaderboard = group.memberships
    .map((m) => ({
      userId: m.user.id,
      name: m.user.name ?? "Anonymous",
      image: m.user.image,
      totalPoints: m.user.predictions.reduce((s, p) => s + (p.points ?? 0), 0),
      predictionsCount: m.user.predictions.length,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return NextResponse.json({
    id: group.id,
    name: group.name,
    description: group.description,
    avatar: group.avatar,
    exactMatchPoints: group.exactMatchPoints,
    directionMatchPoints: group.directionMatchPoints,
    memberCount: group.memberships.length,
    myStatus: myMembership?.status ?? (isAdminRole ? "ADMIN" : null),
    leaderboard,
  });
}
