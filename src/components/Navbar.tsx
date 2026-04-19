"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface GroupItem {
  id: string;
  name: string;
  avatar: string | null;
}

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [myGroups, setMyGroups] = useState<GroupItem[]>([]);
  const [groupDropOpen, setGroupDropOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Group ID from the current URL (only set when on a group page)
  const urlGroupId = pathname.match(/^\/groups\/([^/]+)/)?.[1] ?? null;

  // Current sub-page (matches or leaderboard) — used to stay on the same page when switching groups
  const subPage = pathname.match(/^\/groups\/[^/]+\/(matches|leaderboard)$/)?.[1] ?? null;

  // When URL has a group ID, persist it as the selected group
  useEffect(() => {
    if (urlGroupId) {
      setSelectedGroupId(urlGroupId);
      try { localStorage.setItem("wc2026_group", urlGroupId); } catch {}
    }
  }, [urlGroupId]);

  // On mount, restore selected group from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wc2026_group");
      if (saved) setSelectedGroupId(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/user/groups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMyGroups(data);
          // If saved group is no longer in the list, fall back to first
          setSelectedGroupId((prev) => {
            if (prev && data.some((g: GroupItem) => g.id === prev)) return prev;
            return data[0]?.id ?? null;
          });
        }
      })
      .catch(() => {});
  }, [session?.user?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setGroupDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // The group currently "active" in the navbar context
  const activeGroupId = urlGroupId ?? selectedGroupId ?? myGroups[0]?.id ?? null;
  const activeGroup = myGroups.find((g) => g.id === activeGroupId) ?? myGroups[0] ?? null;

  const hasGroups = myGroups.length > 0;

  // When switching groups, stay on the same sub-page if possible
  const groupLink = (groupId: string) =>
    subPage ? `/groups/${groupId}/${subPage}` : `/groups/${groupId}`;

  return (
    <nav className="bg-fifa-blue text-white shadow-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link
          href={activeGroupId ? `/groups/${activeGroupId}` : "/groups"}
          className="flex items-center gap-2 font-bold text-lg"
        >
          <span>⚽</span>
          <span className="hidden sm:inline">WC2026</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 text-sm font-medium">
          {session && hasGroups && (
            <>
              {/* Group switcher — always visible when user has groups */}
              <div className="relative mr-3" ref={dropRef}>
                <button
                  onClick={() => setGroupDropOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 transition text-sm font-semibold border border-white/20"
                >
                  {activeGroup?.avatar ? (
                    <Image src={activeGroup.avatar} alt="" width={18} height={18} className="rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-white/40 flex items-center justify-center text-xs font-bold">
                      {(activeGroup?.name ?? "G").charAt(0)}
                    </span>
                  )}
                  <span className="max-w-[140px] truncate">{activeGroup?.name ?? "Groups"}</span>
                  <svg className="w-3 h-3 opacity-70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {groupDropOpen && (
                  <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 min-w-[220px] z-50 overflow-hidden">
                    <p className="text-xs text-gray-400 px-3 pt-2.5 pb-1 font-semibold uppercase tracking-wide">Switch Group</p>
                    {myGroups.map((g) => {
                      const isActive = g.id === activeGroupId;
                      return (
                        <Link
                          key={g.id}
                          href={groupLink(g.id)}
                          onClick={() => { setSelectedGroupId(g.id); setGroupDropOpen(false); }}
                          className={`flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition text-sm ${
                            isActive ? "bg-blue-50 text-fifa-blue font-semibold" : "text-gray-800"
                          }`}
                        >
                          {g.avatar ? (
                            <Image src={g.avatar} alt="" width={24} height={24} className="rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-fifa-blue text-white text-xs font-bold flex items-center justify-center shrink-0">
                              {g.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="truncate flex-1">{g.name}</span>
                          {isActive && <span className="text-fifa-blue shrink-0">✓</span>}
                        </Link>
                      );
                    })}
                    <div className="border-t border-gray-100 px-3 py-2">
                      <Link
                        href="/groups"
                        onClick={() => setGroupDropOpen(false)}
                        className="text-xs text-fifa-blue hover:underline"
                      >
                        Browse all groups →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Group-scoped nav links — always visible when user has groups */}
              {activeGroupId && (
                <>
                  <Link
                    href={`/groups/${activeGroupId}/matches`}
                    className={`px-3 py-1.5 rounded-md transition ${
                      pathname.startsWith(`/groups/${activeGroupId}/matches`) || subPage === "matches"
                        ? "text-white bg-white/15"
                        : "text-blue-200 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    Matches
                  </Link>
                  <Link
                    href={`/groups/${activeGroupId}/leaderboard`}
                    className={`px-3 py-1.5 rounded-md transition ${
                      pathname.startsWith(`/groups/${activeGroupId}/leaderboard`) || subPage === "leaderboard"
                        ? "text-white bg-white/15"
                        : "text-blue-200 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    Leaderboard
                  </Link>
                </>
              )}
            </>
          )}

          {/* No groups yet */}
          {session && !hasGroups && (
            <Link href="/groups" className="text-blue-200 hover:text-white transition px-3 py-1.5">
              Browse Groups
            </Link>
          )}

          {(session?.user?.role === "ADMIN" || session?.user?.role === "SUB_ADMIN") && (
            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-md transition font-semibold ${
                pathname.startsWith("/admin") ? "text-fifa-gold bg-white/10" : "text-fifa-gold hover:brightness-110"
              }`}
            >
              Admin
            </Link>
          )}
        </div>

        {/* Auth */}
        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              {session.user?.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? "User"}
                  width={32}
                  height={32}
                  className="rounded-full border-2 border-white/30"
                />
              )}
              <span className="text-sm text-blue-200 max-w-[120px] truncate">
                {session.user?.name ?? session.user?.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-blue-300 hover:text-white transition"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="bg-fifa-gold text-gray-900 px-4 py-1.5 rounded-md text-sm font-semibold hover:brightness-110 transition">
              Sign In
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-blue-900 border-t border-blue-700 px-4 py-3 space-y-1 text-sm">
          {session && hasGroups && activeGroupId && (
            <>
              {/* Active group label */}
              <p className="text-blue-300 text-xs font-semibold uppercase pt-1 pb-1 tracking-wide">
                {activeGroup?.name ?? "Current Group"}
              </p>
              <Link href={`/groups/${activeGroupId}`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <Link href={`/groups/${activeGroupId}/matches`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Matches</Link>
              <Link href={`/groups/${activeGroupId}/leaderboard`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Leaderboard</Link>

              {/* Switch group */}
              {myGroups.length > 1 && (
                <>
                  <p className="text-blue-300 text-xs font-semibold uppercase pt-3 pb-1 tracking-wide">Switch Group</p>
                  {myGroups.filter((g) => g.id !== activeGroupId).map((g) => (
                    <Link
                      key={g.id}
                      href={groupLink(g.id)}
                      className="block py-2 text-blue-200 hover:text-white truncate"
                      onClick={() => { setSelectedGroupId(g.id); setMenuOpen(false); }}
                    >
                      {g.name}
                    </Link>
                  ))}
                </>
              )}
              <div className="pt-1">
                <Link href="/groups" className="block py-2 text-blue-300 hover:text-white text-xs" onClick={() => setMenuOpen(false)}>Browse all groups →</Link>
              </div>
            </>
          )}

          {session && !hasGroups && (
            <Link href="/groups" className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Browse Groups</Link>
          )}

          {(session?.user?.role === "ADMIN" || session?.user?.role === "SUB_ADMIN") && (
            <Link href="/admin" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Admin</Link>
          )}
          {session ? (
            <button onClick={() => signOut({ callbackUrl: "/" })} className="block py-2 text-red-300 hover:text-red-100 w-full text-left">Sign Out</button>
          ) : (
            <Link href="/login" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Sign In</Link>
          )}
        </div>
      )}
    </nav>
  );
}
