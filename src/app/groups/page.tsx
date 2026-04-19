"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  pendingCount: number;
  myStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
}

export default function GroupsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [joining, setJoining] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.replace("/login"); return; }
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setGroups(data); })
      .finally(() => setLoaded(true));
  }, [session, status, router]);

  const handleJoin = async (groupId: string) => {
    setJoining((p) => ({ ...p, [groupId]: true }));
    const res = await fetch(`/api/groups/${groupId}/join`, { method: "POST" });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) => g.id === groupId ? { ...g, myStatus: "PENDING" } : g)
      );
    }
    setJoining((p) => ({ ...p, [groupId]: false }));
  };

  if (status === "loading" || !loaded) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Groups</h1>
      <p className="text-gray-400 text-sm mb-6">
        Join a group to compete with friends on a private leaderboard.
      </p>

      {groups.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-lg mb-1">No groups yet</p>
          <p className="text-sm">The admin will create groups soon.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-gray-800 text-base">{group.name}</h2>
                  {group.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  {group.myStatus === "APPROVED" && (
                    <>
                      <span className="badge bg-green-100 text-green-700">Member</span>
                      <Link
                        href={`/groups/${group.id}`}
                        className="text-xs text-fifa-blue hover:underline font-medium"
                      >
                        View leaderboard →
                      </Link>
                    </>
                  )}
                  {group.myStatus === "PENDING" && (
                    <span className="badge bg-yellow-100 text-yellow-700">Pending approval</span>
                  )}
                  {group.myStatus === "REJECTED" && (
                    <span className="badge bg-red-100 text-red-700">Request rejected</span>
                  )}
                  {group.myStatus === null && (
                    <button
                      onClick={() => handleJoin(group.id)}
                      disabled={joining[group.id]}
                      className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
                    >
                      {joining[group.id] ? "Requesting…" : "Request to join"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
