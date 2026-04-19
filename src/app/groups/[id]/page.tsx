"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface LeaderboardEntry {
  userId: string;
  name: string;
  image: string | null;
  totalPoints: number;
  predictionsCount: number;
  rank: number;
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  myStatus: string | null;
  leaderboard: LeaderboardEntry[] | null;
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function GroupPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.replace("/login"); return; }
    fetch(`/api/groups/${id}`)
      .then((r) => r.json())
      .then((data) => setGroup(data))
      .finally(() => setLoaded(true));
  }, [session, status, id, router]);

  if (status === "loading" || !loaded) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  }

  if (!group) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center text-gray-400">
        Group not found.{" "}
        <Link href="/groups" className="text-fifa-blue hover:underline">Back to groups</Link>
      </div>
    );
  }

  const myId = session?.user?.id;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link href="/groups" className="text-xs text-gray-400 hover:text-fifa-blue mb-4 inline-block">
        ← All groups
      </Link>

      {/* Header */}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{group.name}</h1>
      {group.description && (
        <p className="text-gray-500 text-sm mb-4">{group.description}</p>
      )}

      {/* Not a member states */}
      {group.leaderboard === null && (
        <div className="card text-center py-10">
          {group.myStatus === "PENDING" ? (
            <>
              <p className="text-lg font-semibold text-yellow-600 mb-1">Your request is pending</p>
              <p className="text-sm text-gray-400">An admin or moderator will review your request soon.</p>
            </>
          ) : group.myStatus === "REJECTED" ? (
            <>
              <p className="text-lg font-semibold text-red-500 mb-1">Request rejected</p>
              <p className="text-sm text-gray-400">Contact the admin if you think this was a mistake.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-600 mb-1">Members only</p>
              <p className="text-sm text-gray-400 mb-4">
                Request to join this group to see the leaderboard.
              </p>
              <Link href="/groups" className="btn-primary text-sm">
                Request to join
              </Link>
            </>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {group.leaderboard && (
        <>
          <p className="text-xs text-gray-400 mb-4">
            {group.leaderboard.length} {group.leaderboard.length === 1 ? "member" : "members"} · ranked by total points
          </p>

          {group.leaderboard.length === 0 ? (
            <div className="card text-center py-10 text-gray-400">No members yet.</div>
          ) : (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                    <th className="px-4 py-3 w-10">#</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">Predictions</th>
                    <th className="px-4 py-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {group.leaderboard.map((entry, i) => {
                    const isMe = entry.userId === myId;
                    const isTop = entry.rank <= 3;
                    return (
                      <tr
                        key={entry.userId}
                        className={`border-t border-gray-100 ${
                          isMe
                            ? "bg-yellow-50"
                            : entry.rank === 1
                            ? "bg-yellow-50/40"
                            : i % 2 === 0
                            ? "bg-white"
                            : "bg-gray-50"
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-gray-400">
                          {isTop ? RANK_MEDAL[entry.rank] : entry.rank}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {entry.image ? (
                              <Image
                                src={entry.image}
                                alt=""
                                width={28}
                                height={28}
                                className="rounded-full"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                {entry.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className={`font-medium ${isMe ? "text-fifa-blue" : "text-gray-800"}`}>
                              {entry.name}
                              {isMe && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {entry.predictionsCount}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-fifa-blue">
                          {entry.totalPoints}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
