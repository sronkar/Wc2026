"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";
import { isEmojiAvatar } from "@/lib/groupAvatar";

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  isPublic: boolean;
  memberCount: number;
  myStatus: string | null;
  source: "member" | "invite" | "search";
}

export default function GroupsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState<Record<string, boolean>>({});
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({});

  const fetchGroups = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const url = q.trim() ? `/api/groups?search=${encodeURIComponent(q.trim())}` : "/api/groups";
      const data = await fetch(url).then((r) => r.json());
      if (Array.isArray(data)) setGroups(data);
    } catch {
      /* non-fatal — user will see the last known state */
    } finally {
      setSearching(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.replace("/login"); return; }
    fetchGroups("");
  }, [session, status, router, fetchGroups]);

  // Debounce search
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => fetchGroups(search), 400);
    return () => clearTimeout(t);
  }, [search, loaded, fetchGroups]);

  const handleJoin = async (groupId: string) => {
    setJoining((p) => ({ ...p, [groupId]: true }));
    setJoinErrors((e) => ({ ...e, [groupId]: "" }));
    try {
      const res = await fetch(`/api/groups/${groupId}/join`, { method: "POST" });
      if (res.ok) {
        setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, myStatus: "PENDING" } : g));
      } else {
        const data = await res.json().catch(() => ({}));
        setJoinErrors((e) => ({ ...e, [groupId]: data.error ?? "Failed to join" }));
      }
    } catch {
      setJoinErrors((e) => ({ ...e, [groupId]: "Connection error — try again" }));
    } finally {
      setJoining((p) => ({ ...p, [groupId]: false }));
    }
  };

  const myGroups = groups.filter((g) => g.myStatus === "APPROVED" && g.source === "member");
  const invitedGroups = groups.filter((g) => g.myStatus === "INVITED");
  const pendingGroups = groups.filter((g) => g.myStatus === "PENDING");
  const searchResults = groups.filter((g) => g.source === "search");

  if (status === "loading" || !loaded) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="bar" width="40%" height={22} className="mb-6" />
        <SkeletonRow label="Loading your groups">
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card flex items-center gap-3 p-3">
                <Skeleton variant="circle" width={40} height={40} />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="bar" width="45%" />
                  <Skeleton variant="bar" width="70%" height={10} />
                </div>
              </div>
            ))}
          </div>
        </SkeletonRow>
      </div>
    );
  }

  const GroupCard = ({ g }: { g: GroupRow }) => {
    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUB_ADMIN";
    const canOpen = g.myStatus === "APPROVED" || isAdmin;

    const inner = (
      <>
        {isEmojiAvatar(g.avatar) ? (
          <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-2xl ${canOpen ? "bg-blue-50" : "bg-gray-100"}`} aria-hidden>
            {g.avatar}
          </span>
        ) : g.avatar ? (
          <Image src={g.avatar} alt="" width={40} height={40} className="rounded-full object-cover shrink-0" />
        ) : (
          <div className={`w-10 h-10 rounded-full font-bold flex items-center justify-center shrink-0 text-sm ${canOpen ? "bg-fifa-blue text-white" : "bg-gray-200 text-gray-500"}`}>
            {g.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 group-hover:text-fifa-blue truncate">{g.name}</p>
          {g.description && <p className="text-xs text-gray-400 truncate">{g.description}</p>}
          <p className="text-xs text-gray-400 mt-0.5">{g.memberCount} {g.memberCount === 1 ? "member" : "members"}</p>
        </div>
        <div className="shrink-0">
          {g.myStatus === "INVITED" && (
            <button
              onClick={(e) => { e.preventDefault(); handleJoin(g.id); }}
              disabled={joining[g.id]}
              className="badge bg-blue-100 text-blue-700 text-xs hover:bg-blue-200 transition disabled:opacity-50"
            >
              {joining[g.id] ? "Accepting…" : "Accept Invite →"}
            </button>
          )}
          {g.myStatus === "PENDING" && (
            <span className="badge bg-yellow-100 text-yellow-700 text-xs">Pending</span>
          )}
          {g.myStatus === "REJECTED" && (
            <span className="badge bg-red-100 text-red-700 text-xs">Rejected</span>
          )}
          {canOpen && !g.myStatus?.match(/INVITED|PENDING|REJECTED/) && (
            <span className="text-gray-300 group-hover:text-fifa-blue">›</span>
          )}
          {!canOpen && g.myStatus === null && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={(e) => { e.preventDefault(); handleJoin(g.id); }}
                disabled={joining[g.id]}
                className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
              >
                {joining[g.id] ? "…" : "Request to join"}
              </button>
              {joinErrors[g.id] && (
                <p className="text-[10px] text-red-500 max-w-[120px] text-right">{joinErrors[g.id]}</p>
              )}
            </div>
          )}
        </div>
      </>
    );

    return canOpen ? (
      <Link href={`/groups/${g.id}`} className="card flex items-center gap-3 hover:border-fifa-blue transition group">
        {inner}
      </Link>
    ) : (
      <div className="card flex items-center gap-3">{inner}</div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
      </div>
      <p className="text-gray-400 text-sm mb-6">
        Join a group to compete with friends. Your predictions and points are separate in each group.
      </p>

      {/* My approved groups */}
      {myGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">My Groups</h2>
          <div className="space-y-3">
            {myGroups.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        </div>
      )}

      {/* Invites */}
      {invitedGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pending Invites</h2>
          <div className="space-y-3">
            {invitedGroups.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        </div>
      )}

      {/* Pending requests */}
      {pendingGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pending Requests</h2>
          <div className="space-y-3">
            {pendingGroups.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        </div>
      )}

      {/* Empty state — no groups yet and not searching */}
      {myGroups.length === 0 && invitedGroups.length === 0 && pendingGroups.length === 0 && !search.trim() && (
        <div className="card text-center py-10 mb-6">
          <div className="text-4xl mb-3">⚽</div>
          <p className="font-semibold text-gray-700 mb-1">You're not in any groups yet</p>
          <p className="text-sm text-gray-400">Search for a public group below, or ask a friend for their invite link.</p>
        </div>
      )}

      {/* Search public groups */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Find Public Groups
        </h2>
        <div className="relative mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-gray-300 border-t-fifa-blue rounded-full animate-spin" />
          )}
        </div>

        {search.trim() && searchResults.length === 0 && !searching ? (
          <div className="card text-center py-10 text-gray-400">No public groups match your search.</div>
        ) : search.trim() && searchResults.length > 0 ? (
          <div className="space-y-3">
            {searchResults.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        ) : !search.trim() ? (
          <p className="text-sm text-gray-400 text-center py-4">Type a name above to search for public groups.</p>
        ) : null}
      </div>
    </div>
  );
}
