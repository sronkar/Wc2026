import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";
import { MatchCarousel } from "@/components/dashboard/MatchCarousel";
import { MiniLeaderboard } from "@/components/dashboard/MiniLeaderboard";
import { LockedPredictionsPanel } from "@/components/dashboard/LockedPredictionsPanel";
import { PushSubscribeButton } from "@/components/PushSubscribeButton";
import { CustomPredictionsPanel } from "@/components/dashboard/CustomPredictionsPanel";

export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const now = new Date();

  // ── Next 5 upcoming matches (by kickoff) ──────────────────────────────────
  const upcomingMatches = await prisma.match.findMany({
    where: { status: "SCHEDULED", kickoff: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) } },
    orderBy: { kickoff: "asc" },
    take: 5,
  });

  // ── User's predictions for those matches ─────────────────────────────────
  const upcomingPredictions = await prisma.prediction.findMany({
    where: {
      userId,
      matchId: { in: upcomingMatches.map((m) => m.id) },
    },
  });
  const predMap: Record<string, { homeScore: number; awayScore: number }> = {};
  upcomingPredictions.forEach((p) => {
    predMap[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore };
  });

  // ── Next locked match (to show everyone's picks) ─────────────────────────
  const lockedMatch = upcomingMatches.find((m) => isPredictionLocked(m.kickoff)) ?? null;

  // ── All-time stats for current user ──────────────────────────────────────
  const allPredictions = await prisma.prediction.findMany({
    where: { userId },
    include: { match: { select: { status: true, homeScore: true, awayScore: true } } },
  });
  const totalPoints = allPredictions.reduce((s, p) => s + (p.points ?? 0), 0);
  const exactMatches = allPredictions.filter(
    (p) => p.match.homeScore !== null && p.homeScore === p.match.homeScore && p.awayScore === p.match.awayScore
  ).length;

  // ── Leaderboard ────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      image: true,
      predictions: { where: { points: { not: null } }, select: { points: true } },
    },
  });
  const leaderboard = users
    .map((u) => ({
      id: u.id,
      name: u.name ?? "Anonymous",
      image: u.image,
      totalPoints: u.predictions.reduce((s, p) => s + (p.points ?? 0), 0),
      predictionsCount: u.predictions.length,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  const userRank = leaderboard.find((e) => e.id === userId)?.rank ?? null;

  // Serialize dates for client components
  const carouselMatches = upcomingMatches.map((m) => ({
    ...m,
    kickoff: m.kickoff.toISOString(),
    createdAt: undefined,
    updatedAt: undefined,
  }));

  const lockedMatchSerialized = lockedMatch
    ? { ...lockedMatch, kickoff: lockedMatch.kickoff.toISOString(), createdAt: undefined, updatedAt: undefined }
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {session.user.name?.split(" ")[0] ?? "Predictor"}!
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {userRank ? `You're ranked #${userRank}` : "Start predicting to join the rankings"} · {totalPoints} pts total
          </p>
        </div>
        <PushSubscribeButton />
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Total Points", value: totalPoints, color: "text-fifa-blue" },
          { label: "Predictions", value: allPredictions.length, color: "text-gray-700" },
          { label: "Exact Scores", value: exactMatches, color: "text-green-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center py-3">
            <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Carousel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-800">Next Up to Predict</h2>
              <Link href="/matches" className="text-xs text-fifa-blue hover:underline">All matches →</Link>
            </div>
            <MatchCarousel matches={carouselMatches as Parameters<typeof MatchCarousel>[0]["matches"]} predictions={predMap} />
          </div>

          {/* Locked predictions */}
          <LockedPredictionsPanel lockedMatch={lockedMatchSerialized as Parameters<typeof LockedPredictionsPanel>[0]["lockedMatch"]} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Leaderboard widget */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">Leaderboard</h2>
              <Link href="/leaderboard" className="text-xs text-fifa-blue hover:underline">Full table →</Link>
            </div>
            <MiniLeaderboard entries={leaderboard} currentUserId={userId} />
          </div>

          {/* Custom predictions */}
          <CustomPredictionsPanel />

          {/* Quick links */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-3">Quick Links</h2>
            <div className="space-y-2">
              <Link href="/matches" className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition group">
                <span className="text-sm text-gray-700 group-hover:text-fifa-blue">⚽ All 104 Matches</span>
                <span className="text-gray-300 group-hover:text-fifa-blue">›</span>
              </Link>
              <Link href="/leaderboard" className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition group">
                <span className="text-sm text-gray-700 group-hover:text-fifa-blue">🏆 Global Leaderboard</span>
                <span className="text-gray-300 group-hover:text-fifa-blue">›</span>
              </Link>
              <Link href="/matches?filter=finished" className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition group">
                <span className="text-sm text-gray-700 group-hover:text-fifa-blue">📋 Past Results</span>
                <span className="text-gray-300 group-hover:text-fifa-blue">›</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
