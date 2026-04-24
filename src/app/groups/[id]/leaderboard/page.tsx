"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { GroupSwitcher } from "@/components/GroupSwitcher";

interface Entry {
  id: string;
  rank: number;
  name: string;
  image: string | null;
  totalPoints: number;
  directHits: number;
  predictionsCount: number;
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

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
    }).catch(() => {
      /* non-fatal — user sees empty table; will still load=true so spinner clears */
    }).finally(() => setLoaded(true));
  }, [session, status, groupId, router]);

  if (!loaded) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  }

  const myId = session?.user?.id;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/groups/${groupId}`} className="text-xs text-gray-400 hover:text-fifa-blue mb-4 inline-block">
        ← {groupName}
      </Link>

      <div className="mb-4">
        <GroupSwitcher activeGroupId={groupId} subPage="leaderboard" />
      </div>

      <div className="flex items-center gap-3 mb-6">
        {groupAvatar ? (
          <Image src={groupAvatar} alt="" width={40} height={40} className="rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-fifa-blue text-white font-bold flex items-center justify-center text-sm">
            {groupName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{groupName}</h1>
          <p className="text-gray-400 text-sm">{entries.length} {entries.length === 1 ? "member" : "members"} · ranked by points, then correct outcomes</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No predictions submitted yet.</div>
      ) : (
        <>
          {/* Desktop: table layout */}
          <div className="hidden sm:block card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                  <th className="px-4 py-3 w-10">#</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3 text-right">Preds</th>
                  <th className="px-4 py-3 text-right" title="Points · correct outcomes in parentheses (used as tiebreaker)">Points (Dir.)</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const isMe = e.id === myId;
                  return (
                    <tr
                      key={e.id}
                      className={`border-t border-gray-100 ${
                        isMe ? "bg-yellow-50" : e.rank === 1 ? "bg-yellow-50/30" : i % 2 === 0 ? "bg-white" : "bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3 font-bold text-gray-400">
                        {MEDAL[e.rank] ?? e.rank}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {e.image ? (
                            <Image src={e.image} alt="" width={28} height={28} className="rounded-full" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                              {e.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className={`font-medium ${isMe ? "text-fifa-blue" : "text-gray-800"}`}>
                            {e.name}
                            {isMe && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{e.predictionsCount}</td>
                      <td className="px-4 py-3 text-right font-bold text-fifa-blue">
                        {e.totalPoints}
                        <span className="text-gray-400 font-normal text-xs ml-1">({e.directHits})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: card-per-row layout. Keeps all data visible (preds count
              was hidden in the old table via hidden sm:table-cell). */}
          <div className="sm:hidden space-y-2">
            {entries.map((e) => {
              const isMe = e.id === myId;
              return (
                <div
                  key={e.id}
                  className={`card p-3 flex items-center gap-3 ${
                    isMe ? "bg-yellow-50 border-yellow-200" : e.rank === 1 ? "bg-yellow-50/40" : ""
                  }`}
                >
                  <div className="shrink-0 w-9 text-center font-bold text-gray-400 text-sm">
                    {MEDAL[e.rank] ?? `#${e.rank}`}
                  </div>

                  {e.image ? (
                    <Image src={e.image} alt="" width={36} height={36} className="rounded-full shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500 shrink-0">
                      {e.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isMe ? "text-fifa-blue" : "text-gray-800"}`}>
                      {e.name}
                      {isMe && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {e.predictionsCount} prediction{e.predictionsCount === 1 ? "" : "s"} · {e.directHits} correct outcome{e.directHits === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-lg font-bold text-fifa-blue leading-none">{e.totalPoints}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
