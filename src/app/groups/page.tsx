"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  memberCount: number;
  myStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
}

export default function GroupsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
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
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, myStatus: "PENDING" } : g));
    }
    setJoining((p) => ({ ...p, [groupId]: false }));
  };

  const myGroups = groups.filter((g) => g.myStatus === "APPROVED");
  const filtered = groups.filter((g) => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (status === "loading" || !loaded) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        Join a group to compete with friends. Your predictions and points are separate in each group.
      </p>

      {/* My groups shortcut */}
      {myGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">My Groups</h2>
          <div className="space-y-3">
            {myGroups.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="card flex items-center gap-3 hover:border-fifa-blue transition group"
              >
                {g.avatar ? (
                  <Image src={g.avatar} alt="" width={40} height={40} className="rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-fifa-blue text-white font-bold flex items-center justify-center shrink-0 text-sm">
                    {g.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 group-hover:text-fifa-blue truncate">{g.name}</p>
                  {g.description && <p className="text-xs text-gray-400 truncate">{g.description}</p>}
                </div>
                <span className="text-gray-300 group-hover:text-fifa-blue shrink-0">›</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search + all groups */}
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {myGroups.length > 0 ? "Browse All Groups" : "Available Groups"}
      </h2>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue mb-4"
      />

      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          {search ? "No groups match your search." : "No groups available yet. Check back soon."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => (
            <div key={g.id} className="card flex items-center gap-3">
              {g.avatar ? (
                <Image src={g.avatar} alt="" width={40} height={40} className="rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center shrink-0 text-sm">
                  {g.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{g.name}</p>
                {g.description && <p className="text-xs text-gray-400 truncate">{g.description}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                </p>
              </div>
              <div className="shrink-0">
                {g.myStatus === "APPROVED" && (
                  <Link href={`/groups/${g.id}`} className="text-xs font-semibold text-fifa-blue hover:underline">
                    Open →
                  </Link>
                )}
                {g.myStatus === "PENDING" && (
                  <span className="badge bg-yellow-100 text-yellow-700 text-xs">Pending</span>
                )}
                {g.myStatus === "REJECTED" && (
                  <span className="badge bg-red-100 text-red-700 text-xs">Rejected</span>
                )}
                {g.myStatus === null && (
                  <button
                    onClick={() => handleJoin(g.id)}
                    disabled={joining[g.id]}
                    className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
                  >
                    {joining[g.id] ? "…" : "Request to join"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
