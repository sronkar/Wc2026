import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      image: true,
      predictions: {
        where: { points: { not: null } },
        select: { points: true },
      },
    },
  });

  const leaderboard = users
    .map((u) => ({
      id: u.id,
      name: u.name ?? "Anonymous",
      image: u.image,
      totalPoints: u.predictions.reduce((sum, p) => sum + (p.points ?? 0), 0),
      predictionsCount: u.predictions.length,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  return NextResponse.json(leaderboard);
}
