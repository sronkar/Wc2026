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
      <div className="max-w-2xl mx-auto px-4 py-8">
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
    const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "GROUP_ADMIN";
    const canOpen = g.myStatus === "APPROVED" || isAdmin;

    const inner = (
      <>
        {isEmojiAvatar(g.avatar) ? (
          <span
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-2xl ${
              canOpen ? "bg-blue-50" : "bg-gray-100"
            }`}
            aria-hidden
          >
            {g.avatar}
          </span>
        ) : g.avatar ? (
          <Image src={g.avatar} alt="" width={44} height={44} className="rounded-full object-cover shrink-0" />
        ) : (
          <div
            className={`w-11 h-11 rounded-full font-black flex items-center justify-center shrink-0 text-base ${
              canOpen ? "bg-fifa-blue text-white" : "bg-gray-200 text-gray-500"
            }`}
          >
            {g.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 group-hover:text-fifa-blue truncate">{g.name}</p>
          {g.description && <p className="text-xs text-gray-400 truncate mt-0.5">{g.description}</p>}
          <p className="text-xs text-gray-400 mt-0.5">
            👥 {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="shrink-0">
          {g.myStatus === "INVITED" && (
            <button
              onClick={(e) => { e.preventDefault(); handleJoin(g.id); }}
              disabled={joining[g.id]}
              className="badge bg-pitch-light text-pitch-dark text-xs hover:bg-green-200 transition disabled:opacity-50 font-semibold"
            >
              {joining[g.id] ? "Joining…" : "Accept ✓"}
            </button>
          )}
          {g.myStatus === "PENDING" && (
            <span className="badge bg-yellow-100 text-yellow-700 text-xs">Pending…</span>
          )}
          {g.myStatus === "REJECTED" && (
            <span className="badge bg-red-100 text-red-700 text-xs">Rejected</span>
          )}
          {canOpen && !g.myStatus?.match(/INVITED|PENDING|REJECTED/) && (
            <span className="text-gray-300 group-hover:text-fifa-blue text-lg font-light">›</span>
          )}
          {!canOpen && g.myStatus === null && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={(e) => { e.preventDefault(); handleJoin(g.id); }}
                disabled={joining[g.id]}
                className="btn-primary text-xs px-4 py-1.5 disabled:opacity-50"
              >
                {joining[g.id] ? "…" : "Join"}
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
      <Link href={`/groups/${g.id}`} className="card-interactive flex items-center gap-3 group">
        {inner}
      </Link>
    ) : (
      <div className="card flex items-center gap-3">{inner}</div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-black text-gray-900">Your Groups</h1>
        <p className="text-gray-500 text-sm mt-1">
          Pick a group to see standings, predict matches, and compete with friends.
        </p>
      </div>

      {/* My approved groups */}
      {myGroups.length > 0 && (
        <div className="mb-8 animate-fade-up">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Playing in</h2>
          <div className="space-y-2">
            {myGroups.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        </div>
      )}

      {/* Invites */}
      {invitedGroups.length > 0 && (
        <div className="mb-8 animate-fade-up">
          <h2 className="text-xs font-bold text-pitch-dark uppercase tracking-widest mb-3">
            📬 Invites waiting for you
          </h2>
          <div className="space-y-2">
            {invitedGroups.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        </div>
      )}

      {/* Pending requests */}
      {pendingGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Pending Requests</h2>
          <div className="space-y-2">
            {pendingGroups.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        </div>
      )}

      {/* Empty state — no groups yet and not searching */}
      {myGroups.length === 0 && invitedGroups.length === 0 && pendingGroups.length === 0 && !search.trim() && (
        <div className="card text-center py-12 mb-6 border-dashed border-2 border-gray-200 bg-gray-50/50">
          <div className="text-5xl mb-3">⚽</div>
          <p className="font-bold text-gray-700 text-lg mb-1">No groups yet</p>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">
            Ask a friend to send you their invite link, or search for a public group below.
          </p>
        </div>
      )}

      {/* Search public groups */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
          Find Public Groups
        </h2>
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue/40 focus:border-fifa-blue bg-white shadow-sm"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-block w-4 h-4 border-2 border-gray-300 border-t-fifa-blue rounded-full animate-spin" />
          )}
        </div>

        {search.trim() && searchResults.length === 0 && !searching ? (
          <div className="card text-center py-10 text-gray-400">
            <div className="text-3xl mb-2">🤷</div>
            No public groups match &ldquo;{search}&rdquo;
          </div>
        ) : search.trim() && searchResults.length > 0 ? (
          <div className="space-y-2">
            {searchResults.map((g) => <GroupCard key={g.id} g={g} />)}
          </div>
        ) : !search.trim() ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Type a name above to search for public groups.
          </p>
        ) : null}
      </div>
    </div>
  );
}
