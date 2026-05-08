import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";
import { getNow } from "@/lib/time";
import Image from "next/image";
import Link from "next/link";
import { MatchCarousel } from "@/components/dashboard/MatchCarousel";
import { MiniLeaderboard } from "@/components/dashboard/MiniLeaderboard";
import { isEmojiAvatar } from "@/lib/groupAvatar";
import { LeaveGroupButton } from "@/components/LeaveGroupButton";
import { MatchCard } from "@/components/MatchCard";
import { GeneralPredictionsCarousel } from "@/components/dashboard/GeneralPredictionsCarousel";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { WC_GROUPS, ADVANCEMENT_LOCK_TIME } from "@/lib/wcGroups";
import { FirstGroupVisitModal } from "@/components/onboarding/FirstGroupVisitModal";
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

  // Cheap check for onboarding: does this user have any prediction anywhere?
  // If not, they're a first-time visitor and the welcome modal will offer to
  // show once (subject to per-user localStorage dismissal).
  const totalUserPredictions = await prisma.prediction.count({ where: { userId } });
  const showFirstVisitOnboarding =
    membership?.memberRole !== "VISITOR_ADMIN" && totalUserPredictions === 0;

  const now = getNow();

  // Count today's matches (UTC day) to determine carousel size
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const todayCount = await prisma.match.count({
    where: {
      status: "SCHEDULED",
      kickoff: { gte: todayStart, lt: todayEnd },
      isDemo: false,
    },
  });
  const carouselTake = Math.max(5, todayCount);

  const upcomingMatches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      kickoff: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      isDemo: false,
    },
    orderBy: { kickoff: "asc" },
    take: carouselTake,
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

  // Count today's matches in the carousel and how many are predicted
  const todayMatchIds = upcomingMatches
    .filter((m) => m.kickoff >= todayStart && m.kickoff < todayEnd)
    .map((m) => m.id);
  const todayPredictedCount = todayMatchIds.filter((id) => predMap[id] !== undefined).length;

  // Live match: most recently locked (past 24h or locking within next 1h), any status
  const recentCandidates = await prisma.match.findMany({
    where: {
      isDemo: false,
      kickoff: {
        gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(now.getTime() + 60 * 60 * 1000),
      },
    },
    orderBy: { kickoff: "desc" },
    take: 1,
  });
  const candidateLiveMatch = recentCandidates[0] ?? null;

  // Find the next upcoming match to determine when the live window ends
  const nextMatchAfterCandidate = candidateLiveMatch
    ? await prisma.match.findFirst({
        where: { isDemo: false, kickoff: { gt: candidateLiveMatch.kickoff } },
        orderBy: { kickoff: "asc" },
      })
    : null;

  const liveWindowEnd = nextMatchAfterCandidate
    ? new Date(nextMatchAfterCandidate.kickoff.getTime() - 60 * 60 * 1000)
    : null;

  const liveMatch =
    candidateLiveMatch &&
    isPredictionLocked(candidateLiveMatch.kickoff) &&
    (liveWindowEnd === null || now < liveWindowEnd)
      ? candidateLiveMatch
      : null;

  const livePrediction = liveMatch
    ? await prisma.prediction.findUnique({
        where: { userId_matchId_groupId: { userId, matchId: liveMatch.id, groupId } },
      })
    : null;

  const [groupPredictions, customAnswers, advancementPreds] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, groupId },
      include: { match: { select: { status: true, homeScore: true, awayScore: true } } },
    }),
    prisma.customPredictionAnswer.findMany({ where: { userId, groupId }, select: { points: true } }),
    prisma.advancementPrediction.findMany({ where: { userId, groupId }, select: { points: true } }),
  ]);
  const totalPoints =
    groupPredictions.reduce((s, p) => s + (p.points ?? 0), 0) +
    customAnswers.reduce((s, p) => s + (p.points ?? 0), 0) +
    advancementPreds.reduce((s, p) => s + (p.points ?? 0), 0);
  const exactMatches = groupPredictions.filter(
    (p) =>
      p.match.homeScore !== null &&
      p.homeScore === p.match.homeScore &&
      p.awayScore === p.match.awayScore
  ).length;

  const isVisitor = membership?.memberRole === "VISITOR_ADMIN";

  // Advancement picks progress (for quick link badge)
  const advancementLocked = getNow() >= ADVANCEMENT_LOCK_TIME;
  const savedAdvancementPicks = isVisitor ? [] : await prisma.advancementPrediction.findMany({
    where: { userId, groupId },
    select: { team: true, pick: true },
  });
  const savedPickMap: Record<string, string> = {};
  for (const p of savedAdvancementPicks) savedPickMap[p.team] = p.pick;
  const advancementPickCount = savedAdvancementPicks.length;
  // 32 required: 12 winners + 12 runners-up + 8 third-place picks
  const ADVANCEMENT_REQUIRED = 32;
  const advancementComplete = !isVisitor && advancementPickCount >= ADVANCEMENT_REQUIRED;

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
          customPredictionAnswers: {
            where: { points: { not: null }, groupId },
            select: { points: true },
          },
          advancementPredictions: {
            where: { points: { not: null }, groupId },
            select: { points: true },
          },
        },
      },
    },
  });

  const leaderboard = memberships
    .map((m) => {
      const allPts = [
        ...m.user.predictions.map((p) => p.points ?? 0),
        ...m.user.customPredictionAnswers.map((p) => p.points ?? 0),
        ...m.user.advancementPredictions.map((p) => p.points ?? 0),
      ];
      const totalPoints = allPts.reduce((s, p) => s + p, 0);
      const directHits = allPts.filter((p) => p > 0).length;
      const zeroPoints = allPts.filter((p) => p === 0).length;
      return {
        id: m.user.id,
        name: m.user.name ?? "Anonymous",
        image: m.user.image,
        totalPoints,
        directHits,
        zeroPoints,
        predictionsCount: m.user.predictions.length,
      };
    })
    .sort((a, b) =>
      b.totalPoints !== a.totalPoints ? b.totalPoints - a.totalPoints :
      b.directHits !== a.directHits ? b.directHits - a.directHits :
      a.zeroPoints !== b.zeroPoints ? a.zeroPoints - b.zeroPoints :
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

  const liveMatchSerialized = liveMatch
    ? {
        id: liveMatch.id,
        matchNumber: liveMatch.matchNumber,
        homeTeam: liveMatch.homeTeam,
        awayTeam: liveMatch.awayTeam,
        group: liveMatch.group,
        round: liveMatch.round,
        venue: liveMatch.venue,
        city: liveMatch.city,
        kickoff: liveMatch.kickoff.toISOString(),
        homeScore: liveMatch.homeScore,
        awayScore: liveMatch.awayScore,
        status: liveMatch.status,
      }
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 md:py-8">
      <FirstGroupVisitModal
        userId={userId}
        groupId={groupId}
        showForNewUsers={showFirstVisitOnboarding}
      />

      {/* Group header */}
      <div className="flex items-center gap-4 mb-4 md:mb-6">
        {isEmojiAvatar(group.avatar) ? (
          <span className="w-[52px] h-[52px] rounded-full bg-blue-50 text-3xl flex items-center justify-center shrink-0 border-2 border-white shadow" aria-hidden>
            {group.avatar}
          </span>
        ) : group.avatar ? (
          <Image
            src={group.avatar}
            alt={group.name}
            width={52}
            height={52}
            className="rounded-full object-cover shrink-0 border-2 border-white shadow"
          />
        ) : (
          <div className="w-[52px] h-[52px] rounded-full bg-fifa-blue text-white font-extrabold text-xl flex items-center justify-center shrink-0 shadow">
            {group.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
          {group.description && (
            <p className="text-gray-400 text-sm mt-0.5">{group.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {userRank ? `You're ranked #${userRank} in this group` : "Start predicting to join the rankings"} · {totalPoints} pts
          </p>
        </div>
        {!isAdminRole && !isVisitor && membership?.status === "APPROVED" && (
          <LeaveGroupButton groupId={groupId} groupName={group.name} />
        )}
      </div>

      <div className="mb-3 md:mb-6">
        <GroupSwitcher activeGroupId={groupId} />
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-5 md:mb-8">
        {[
          { label: "Group Points", value: totalPoints, color: "text-fifa-blue" },
          { label: "Predictions", value: groupPredictions.length, color: "text-gray-700" },
          { label: "Exact Scores", value: exactMatches, color: exactMatches > 0 ? "text-green-600" : "text-gray-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center py-3">
            <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        {/* Right column — first in DOM so it appears first on mobile. */}
        <div className="space-y-4 md:space-y-6 min-w-0">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">Group Leaderboard</h2>
              <Link href={`/groups/${groupId}/leaderboard`} className="text-xs font-semibold text-fifa-blue hover:underline px-2 py-0.5 rounded-md hover:bg-blue-50 transition">
                Full table →
              </Link>
            </div>
            <MiniLeaderboard entries={leaderboard} currentUserId={userId} />
          </div>

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
              {!isVisitor && (
                <Link
                  href={`/groups/${groupId}/advancement`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition group"
                >
                  <span className="text-sm text-gray-700 group-hover:text-fifa-blue flex items-center gap-2">
                    🏅 Group Stage Picks
                    {!advancementLocked && (
                      advancementComplete
                        ? <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">✓ Done</span>
                        : <span className={`text-[10px] font-semibold ${advancementPickCount === 0 ? "text-amber-500" : "text-orange-500"}`}>
                            {advancementPickCount}/{ADVANCEMENT_REQUIRED} picks
                          </span>
                    )}
                  </span>
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

        {/* Left column — second in DOM (below leaderboard on mobile). */}
        <div className="flex flex-col gap-4 md:gap-6 min-w-0">
          {!isVisitor && upcomingMatches.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-gray-800">Next Up to Predict</h2>
                <Link href={`/groups/${groupId}/matches`} className="text-xs text-fifa-blue hover:underline shrink-0 whitespace-nowrap ml-2">All matches →</Link>
              </div>
              {todayMatchIds.length > 0 && (
                <p className="text-xs text-gray-400 mb-3">
                  {todayPredictedCount} of {todayMatchIds.length} today predicted
                </p>
              )}
              <MatchCarousel
                groupId={groupId}
                matches={carouselMatches as Parameters<typeof MatchCarousel>[0]["matches"]}
                predictions={predMap}
                nowMs={getNow().getTime()}
              />
            </div>
          )}
          {isVisitor && (
            <div className="card text-center py-6 text-gray-400 text-sm">
              You are a Visitor Admin — predictions are disabled for your account in this group.
            </div>
          )}

          <div>
            <h2 className="font-bold text-gray-800 mb-3">General Predictions</h2>
            <GeneralPredictionsCarousel groupId={groupId} />
          </div>

          {liveMatchSerialized && (
            <div>
              <h2 className="font-bold text-gray-800 mb-3">
                {liveMatchSerialized.status === "FINISHED" ? "Last Match" : "Live Now"}
              </h2>
              <MatchCard
                match={liveMatchSerialized}
                prediction={
                  livePrediction
                    ? { homeScore: livePrediction.homeScore, awayScore: livePrediction.awayScore, points: livePrediction.points }
                    : undefined
                }
                isLoggedIn={true}
                groupId={groupId}
                nowMs={getNow().getTime()}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
