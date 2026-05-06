"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { isEmojiAvatar } from "@/lib/groupAvatar";

interface Entry {
  id: string;
  rank: number;
  name: string;
  image: string | null;
  totalPoints: number;
  directHits: number;
  predictionsCount: number;
}

function Avatar({ entry, size = 40 }: { entry: Entry; size?: number }) {
  return entry.image ? (
    <Image src={entry.image} alt={entry.name} width={size} height={size} className="rounded-full object-cover ring-2 ring-white/60" />
  ) : (
    <div
      className="rounded-full bg-white/30 flex items-center justify-center font-black text-white ring-2 ring-white/60"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {entry.name.charAt(0).toUpperCase()}
    </div>
  );
}

function PodiumCard({ entry, myId }: { entry: Entry; myId: string | undefined }) {
  const isMe = entry.id === myId;
  const configs: Record<number, { bg: string; ring: string; shadow: string; label: string; size: number; order: string; height: string }> = {
    1: {
      bg: "bg-gradient-to-b from-yellow-400 to-amber-500",
      ring: "ring-yellow-300",
      shadow: "shadow-podium-gold",
      label: "🥇 1st",
      size: 56,
      order: "order-2",
      height: "pt-4",
    },
    2: {
      bg: "bg-gradient-to-b from-slate-300 to-slate-400",
      ring: "ring-slate-200",
      shadow: "shadow-podium-silver",
      label: "🥈 2nd",
      size: 44,
      order: "order-1",
      height: "pt-8",
    },
    3: {
      bg: "bg-gradient-to-b from-amber-600 to-amber-700",
      ring: "ring-amber-400",
      shadow: "shadow-podium-bronze",
      label: "🥉 3rd",
      size: 44,
      order: "order-3",
      height: "pt-8",
    },
  };
  const c = configs[entry.rank];
  if (!c) return null;

  return (
    <div className={`${c.order} ${c.height} flex flex-col items-center gap-2 animate-fade-up`} style={{ animationDelay: `${(entry.rank - 1) * 80}ms` }}>
      <div className={`relative rounded-full ${c.bg} ${c.shadow} p-1 ring-2 ${c.ring}`}>
        <Avatar entry={entry} size={c.size} />
        {isMe && (
          <span className="absolute -bottom-1 -right-1 bg-fifa-blue text-white text-[9px] font-black px-1 rounded-full ring-1 ring-white">YOU</span>
        )}
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-gray-500">{c.label}</p>
        <p className="text-sm font-bold text-gray-800 leading-tight max-w-[80px] truncate">{entry.name}</p>
        <p className="text-lg font-black text-fifa-blue leading-tight">{entry.totalPoints}</p>
        <p className="text-[10px] text-gray-400">pts</p>
      </div>
    </div>
  );
}

export default function GroupLeaderboardPage() {
  const { data: session, status } = useSession();
  const { id: groupId } = useParams<{ id: string }>();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.replace("/login"); return; }

    Promise.all([
      fetch(`/api/leaderboard?groupId=${groupId}`).then((r) => r.json()),
      fetch(`/api/groups/${groupId}`).then((r) => r.json()),
    ]).then(([lb, g]) => {
      if (Array.isArray(lb)) setEntries(lb);
      setGroupName(g.name ?? "");
      setGroupAvatar(g.avatar ?? null);
      if (!g.leaderboard && g.myStatus !== "APPROVED") router.replace("/groups");
    }).catch(() => {}).finally(() => setLoaded(true));
  }, [session, status, groupId, router]);

  if (!loaded) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Skeleton variant="bar" width="30%" height={28} className="mb-6" />
        <SkeletonRow label="Loading leaderboard">
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-3 flex items-center gap-3">
                <Skeleton variant="circle" width={28} height={28} />
                <Skeleton variant="bar" className="flex-1" />
                <Skeleton variant="bar" width={40} height={14} />
              </div>
            ))}
          </div>
        </SkeletonRow>
      </div>
    );
  }

  const myId = session?.user?.id;
  const top3 = entries.filter((e) => e.rank <= 3);
  const rest = entries.filter((e) => e.rank > 3);
  const myEntry = entries.find((e) => e.id === myId);
  const myRank = myEntry?.rank;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/groups/${groupId}`} className="text-xs text-gray-400 hover:text-fifa-blue mb-4 inline-block">
        ← {groupName}
      </Link>

      <div className="mb-4">
        <GroupSwitcher activeGroupId={groupId} subPage="leaderboard" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {isEmojiAvatar(groupAvatar) ? (
          <span className="w-10 h-10 rounded-full bg-blue-50 text-2xl flex items-center justify-center" aria-hidden>
            {groupAvatar}
          </span>
        ) : groupAvatar ? (
          <Image src={groupAvatar} alt="" width={40} height={40} className="rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-fifa-blue text-white font-bold flex items-center justify-center text-sm">
            {groupName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black text-gray-900">{groupName} <span className="text-fifa-gold">🏆</span></h1>
          <p className="text-gray-400 text-sm">
            {entries.length} {entries.length === 1 ? "player" : "players"}
            {myRank ? ` · you're #${myRank}` : ""}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="card p-0">
          <EmptyState
            icon="📊"
            title="No scores yet"
            description="The leaderboard fills up as members predict and match results come in."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Podium — top 3 */}
          {top3.length > 0 && (
            <div className="card bg-gradient-to-b from-slate-50 to-white border-gray-200 overflow-hidden">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-center mb-4">Standings</p>
              <div className="flex items-end justify-center gap-4 pb-2">
                {/* Render in podium order: 2nd, 1st, 3rd */}
                {[
                  top3.find((e) => e.rank === 2),
                  top3.find((e) => e.rank === 1),
                  top3.find((e) => e.rank === 3),
                ]
                  .filter(Boolean)
                  .map((e) => (
                    <PodiumCard key={e!.id} entry={e!} myId={myId} />
                  ))}
              </div>
            </div>
          )}

          {/* Rank 4+ */}
          {rest.length > 0 && (
            <div className="space-y-2">
              {rest.map((e, i) => {
                const isMe = e.id === myId;
                return (
                  <div
                    key={e.id}
                    className={`card flex items-center gap-3 transition-all animate-fade-up ${
                      isMe
                        ? "border-fifa-blue/40 bg-blue-50/60 shadow-card-hover"
                        : "hover:shadow-card-hover hover:border-gray-200"
                    }`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="shrink-0 w-9 text-center font-black text-gray-400 text-sm">
                      #{e.rank}
                    </div>

                    {e.image ? (
                      <Image src={e.image} alt="" width={36} height={36} className="rounded-full shrink-0 ring-1 ring-gray-200" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                        {e.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isMe ? "text-fifa-blue" : "text-gray-800"}`}>
                        {e.name}
                        {isMe && <span className="text-[10px] text-gray-400 ml-1.5 font-normal">(you)</span>}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {e.predictionsCount} prediction{e.predictionsCount !== 1 ? "s" : ""} · {e.directHits} correct
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className={`text-xl font-black leading-none ${isMe ? "text-fifa-blue" : "text-gray-700"}`}>
                        {e.totalPoints}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">pts</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* My position callout if outside top visible */}
          {myEntry && myRank && myRank > 3 && (
            <p className="text-center text-xs text-gray-400">
              You&apos;re ranked <span className="font-bold text-fifa-blue">#{myRank}</span> out of {entries.length} players.
              {myRank > 3 && entries[myRank - 2] && (
                <> {entries[myRank - 2].totalPoints - myEntry.totalPoints} pts behind #{myRank - 1}.</>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
