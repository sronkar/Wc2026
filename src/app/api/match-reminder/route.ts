import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";

const LOCK_OFFSET_MS = 60 * 60 * 1000; // predictions lock 60 min before kickoff

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const now = getNow();
  const nowMs = now.getTime();

  // UTC day boundaries derived from virtual server time
  const todayStart = new Date(nowMs);
  todayStart.setUTCHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterStart = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

  // Today: kickoff still predictable (lock hasn't passed) and before midnight
  // Tomorrow: full day, all predictable
  const [todayMatches, tomorrowMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "SCHEDULED",
        isDemo: false,
        kickoff: { gt: new Date(nowMs + LOCK_OFFSET_MS), lt: tomorrowStart },
      },
      select: { id: true },
    }),
    prisma.match.findMany({
      where: {
        status: "SCHEDULED",
        isDemo: false,
        kickoff: { gte: tomorrowStart, lt: dayAfterStart },
      },
      select: { id: true },
    }),
  ]);

  const allMatchIds = [
    ...todayMatches.map((m) => m.id),
    ...tomorrowMatches.map((m) => m.id),
  ];

  if (allMatchIds.length === 0) {
    return NextResponse.json({
      todayUnpredicted: 0,
      tomorrowUnpredicted: 0,
      serverNowMs: nowMs,
      primaryGroupId: null,
    });
  }

  const [predicted, membership] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, matchId: { in: allMatchIds } },
      select: { matchId: true },
      distinct: ["matchId"],
    }),
    prisma.groupMembership.findFirst({
      where: { userId, status: "APPROVED" },
      orderBy: { createdAt: "asc" },
      select: { groupId: true },
    }),
  ]);

  const predictedIds = new Set(predicted.map((p) => p.matchId));

  return NextResponse.json({
    todayUnpredicted: todayMatches.filter((m) => !predictedIds.has(m.id)).length,
    tomorrowUnpredicted: tomorrowMatches.filter((m) => !predictedIds.has(m.id)).length,
    serverNowMs: nowMs,
    primaryGroupId: membership?.groupId ?? null,
  });
}
