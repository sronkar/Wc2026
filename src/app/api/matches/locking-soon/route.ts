import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json([]);

  const now = getNow();
  const userId = session.user.id;

  // ── Urgent: matches where the lock (kickoff − 60 min) is ≤ 2 hours away ──
  // Lock = kickoff − 60 min ≤ now + 2h  ⟹  kickoff ≤ now + 3h
  // Lock > now                           ⟹  kickoff > now + 1h  (not already locked)
  const urgentKickoffFrom = new Date(now.getTime() + 60 * 60 * 1000);
  const urgentKickoffTo   = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const urgentMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      isDemo: false,
      kickoff: { gt: urgentKickoffFrom, lt: urgentKickoffTo },
    },
    orderBy: { kickoff: "asc" },
    take: 5,
  });

  // ── Next unpredicted: the next upcoming match within 24 h that user hasn't picked ──
  const next24hKickoffTo = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcoming24h = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      isDemo: false,
      kickoff: { gt: urgentKickoffFrom, lt: next24hKickoffTo },
    },
    orderBy: { kickoff: "asc" },
    take: 10,
  });

  // Combine match IDs for one prediction query
  const allMatchIds = Array.from(
    new Set([...urgentMatches.map((m) => m.id), ...upcoming24h.map((m) => m.id)])
  );

  const [predictions, firstMembership] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, matchId: { in: allMatchIds } },
      select: { matchId: true },
    }),
    prisma.groupMembership.findFirst({
      where: { userId, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
      select: { groupId: true },
      orderBy: { joinedAt: "asc" },
    }),
  ]);
  const predictedIds = new Set(predictions.map((p) => p.matchId));
  const fallbackGroupId = firstMembership?.groupId ?? null;

  // Serialize both lists
  const serialize = (m: (typeof urgentMatches)[0]) => ({
    id: m.id,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    kickoff: m.kickoff.toISOString(),
    lockTime: new Date(m.kickoff.getTime() - 60 * 60 * 1000).toISOString(),
    hasPrediction: predictedIds.has(m.id),
  });

  const urgentSerialized = urgentMatches.map(serialize);

  // Next unpredicted in 24h that is NOT already in urgentMatches
  const urgentIds = new Set(urgentMatches.map((m) => m.id));
  const nextUnpredicted = upcoming24h
    .filter((m) => !urgentIds.has(m.id) && !predictedIds.has(m.id))
    .slice(0, 1)
    .map(serialize);

  return NextResponse.json({ urgent: urgentSerialized, nextUnpredicted, serverNowMs: now.getTime(), fallbackGroupId });
}
