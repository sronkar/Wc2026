import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";
import Image from "next/image";
import Link from "next/link";
import { MatchCarousel } from "@/components/dashboard/MatchCarousel";
import { MiniLeaderboard } from "@/components/dashboard/MiniLeaderboard";
import { LockedPredictionsPanel } from "@/components/dashboard/LockedPredictionsPanel";
import { CustomPredictionsPanel } from "@/components/dashboard/CustomPredictionsPanel";
import { GroupSwitcher } from "@/components/GroupSwitcher";
export const revalidate = 0;

export default async function GroupDashboardPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const groupId = params.id;
  const userId = session.user.id;
  const role = session.user.role;
  const isAdminRole = role === "ADMIN" || role === "SUB_ADMIN";

  const [group, membership] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    }),
  ]);

  if (!group) redirect("/groups");
  if (!isAdminRole && membership?.status !== "APPROVED") redirect("/groups");

  const now = new Date();

  const upcomingMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      kickoff: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      isDemo: false,
    },
    orderBy: { kickoff: "asc" },
    take: 5,
  });

  const upcomingPredictions = await prisma.prediction.findMany({
    where: {
      userId,
      groupId,
      matchId: { in: upcomingMatches.map((m) => m.id) },
    },
  });
  const predMap: Record<string, { homeScore: number; awayScore: number }> = {};
  upcomingPredictions.forEach((p) => {
    predMap[p.matchId] = { homeScore: p.homeScore, awayScore: p.awayScore };
  });

  const lockedMatch = upcomingMatches.find((m) => isPredictionLocked(m.kickoff)) ?? null;

  const groupPredictions = await prisma.prediction.findMany({
    where: { userId, groupId },
    include: { match: { select: { status: true, homeScore: true, awayScore: true } } },
  });
  const totalPoints = groupPredictions.reduce((s, p) => s + (p.points ?? 0), 0);
  const exactMatches = groupPredictions.filter(
    (p) =>
      p.match.homeScore !== null &&
      p.homeScore === p.match.homeScore &&
      p.awayScore === p.match.awayScore
  ).length;

  const isVisitor = membership?.memberRole === "VISITOR_ADMIN";

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

  const userRank = leaderboard.find((e) => e.id === userId)?.rank ?? null;

  const carouselMatches = upcomingMatches.map((m) => ({
    ...m,
    kickoff: m.kickoff.toISOString(),
    createdAt: undefined,
    updatedAt: undefined,
  }));

  const lockedMatchSerialized = lockedMatch
    ? {
        ...lockedMatch,
        kickoff: lockedMatch.kickoff.toISOString(),
        createdAt: undefined,
        updatedAt: undefined,
      }
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Group header */}
      <div className="flex items-center gap-4 mb-6">
        {group.avatar ? (
          <Image
            src={group.avatar}
            alt={group.name}
            width={52}
            height={52}
            className="rounded-full object-cover shrink-0 border-2 border-white shadow"
          />
        ) : (
          <div className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-fifa-blue text-white font-extrabold text-xl flex items-center justify-center shrink-0 shadow">
            {group.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
          {group.description && (
            <p className="text-gray-400 text-sm mt-0.5">{group.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {userRank ? `You're ranked #${userRank} in this group` : "Start predicting to join the rankings"} · {totalPoints} pts
          </p>
        </div>
      </div>

      <div className="mb-6">
        <GroupSwitcher activeGroupId={groupId} />
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Group Points", value: totalPoints, color: "text-fifa-blue" },
          { label: "Predictions", value: groupPredictions.length, color: "text-gray-700" },
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
          {!isVisitor && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-800">Next Up to Predict</h2>
                <Link href={`/groups/${groupId}/matches`} className="text-xs text-fifa-blue hover:underline">All matches →</Link>
              </div>
              <MatchCarousel
                groupId={groupId}
                matches={carouselMatches as Parameters<typeof MatchCarousel>[0]["matches"]}
                predictions={predMap}
              />
            </div>
          )}
          {isVisitor && (
            <div className="card text-center py-6 text-gray-400 text-sm">
              You are a Visitor Admin — predictions are disabled for your account in this group.
            </div>
          )}
          <LockedPredictionsPanel
            groupId={groupId}
            lockedMatch={lockedMatchSerialized as Parameters<typeof LockedPredictionsPanel>[0]["lockedMatch"]}
          />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">Group Leaderboard</h2>
              <Link href={`/groups/${groupId}/leaderboard`} className="text-xs text-fifa-blue hover:underline">
                Full table →
              </Link>
            </div>
            <MiniLeaderboard entries={leaderboard} currentUserId={userId} />
          </div>

          <CustomPredictionsPanel groupId={groupId} />

          <div className="card">
            <h2 className="font-bold text-gray-800 mb-3">Quick Links</h2>
            <div className="space-y-2">
              {!isVisitor && (
                <Link
                  href={`/groups/${groupId}/matches`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition group"
                >
                  <span className="text-sm text-gray-700 group-hover:text-fifa-blue">⚽ All 104 Matches</span>
                  <span className="text-gray-300 group-hover:text-fifa-blue">›</span>
                </Link>
              )}
              <Link
                href={`/groups/${groupId}/leaderboard`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition group"
              >
                <span className="text-sm text-gray-700 group-hover:text-fifa-blue">🏆 Group Leaderboard</span>
                <span className="text-gray-300 group-hover:text-fifa-blue">›</span>
              </Link>
              <Link
                href="/groups"
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition group"
              >
                <span className="text-sm text-gray-700 group-hover:text-fifa-blue">👥 All My Groups</span>
                <span className="text-gray-300 group-hover:text-fifa-blue">›</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
