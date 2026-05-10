"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NotificationCenter } from "@/components/NotificationCenter";
import { isEmojiAvatar } from "@/lib/groupAvatar";

interface GroupItem {
  id: string;
  name: string;
  avatar: string | null;
  memberRole: string | null;
}

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [myGroups, setMyGroups] = useState<GroupItem[]>([]);
  const [groupDropOpen, setGroupDropOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);

  // Group ID from the current URL (only set when on a group page)
  const urlGroupId = pathname.match(/^\/groups\/([^/]+)/)?.[1] ?? null;

  // Current sub-page — used to stay on the same page when switching groups
  const subPage = pathname.match(/^\/groups\/[^/]+\/(matches|leaderboard|advancement)$/)?.[1] ?? null;

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

  const fetchGroups = () => {
    if (!session?.user?.id) return;
    fetch("/api/user/groups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMyGroups(data);
          setSelectedGroupId((prev) => {
            if (prev && data.some((g: GroupItem) => g.id === prev)) return prev;
            return data[0]?.id ?? null;
          });
        }
      })
      .catch(() => {});
  };

  const fetchPendingCount = () => {
    const role = session?.user?.role;
    if (role !== "ADMIN" && role !== "GROUP_ADMIN") return;
    fetch("/api/admin/pending-count")
      .then((r) => r.json())
      .then((d) => { if (typeof d?.count === "number") setPendingCount(d.count); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchGroups();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Re-fetch groups when any part of the app signals a change
  useEffect(() => {
    const handler = () => fetchGroups();
    window.addEventListener("wc2026:groups-updated", handler);
    return () => window.removeEventListener("wc2026:groups-updated", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Fetch + poll pending join request count for admins
  useEffect(() => {
    fetchPendingCount();
    const id = setInterval(fetchPendingCount, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Redirect to profile setup if logged in but has no name
  useEffect(() => {
    if (session && !session.user?.name && pathname !== "/profile" && pathname !== "/login") {
      router.replace("/profile?setup=1");
    }
  }, [session, pathname, router]);

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
  const isVisitorAdmin = activeGroup?.memberRole === "VISITOR_ADMIN";

  const hasGroups = myGroups.length > 0;

  // When switching groups, preserve the current page type
  const groupLink = (newGroupId: string) => {
    // On /admin/groups/[id] → switch to the same page for the new group
    if (pathname.match(/^\/admin\/groups\/[^/]+/)) return `/admin/groups/${newGroupId}`;
    // On the global /admin page (not group-scoped) → stay put with the tab preserved
    if (pathname === "/admin") {
      const search = typeof window !== "undefined" ? window.location.search : "";
      return `/admin${search}`;
    }
    // On a group sub-page (matches/leaderboard) → preserve it
    if (subPage) return `/groups/${newGroupId}/${subPage}`;
    return `/groups/${newGroupId}`;
  };

  return (
    <nav
      className="bg-navbar-gradient text-white shadow-lg sticky top-0 z-50"
      // Pad the navbar's TOP by the iOS notch height when the app is launched
      // in standalone mode (Add to Home Screen). On regular browser tabs the
      // safe-area inset is 0 and this is a no-op.
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link
          href={activeGroupId ? `/groups/${activeGroupId}` : "/groups"}
          className="flex items-center gap-2 shrink-0"
        >
          {/* Soccer ball — Telstar pattern with larger patches */}
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
            <defs>
              <clipPath id="sb">
                <circle cx="15" cy="15" r="13.5"/>
              </clipPath>
            </defs>
            <circle cx="15" cy="15" r="13.5" fill="white" fillOpacity="0.93"/>
            <g clipPath="url(#sb)" transform="rotate(-20, 15, 15)">
              <polygon points="15,10 19.76,13.46 17.94,19.05 12.06,19.05 10.24,13.46" fill="#111"/>
              <line x1="15" y1="10" x2="15" y2="9.5" stroke="#111" strokeWidth="1"/>
              <line x1="19.76" y1="13.46" x2="20.23" y2="13.3" stroke="#111" strokeWidth="1"/>
              <line x1="17.94" y1="19.05" x2="18.24" y2="19.46" stroke="#111" strokeWidth="1"/>
              <line x1="12.06" y1="19.05" x2="11.76" y2="19.46" stroke="#111" strokeWidth="1"/>
              <line x1="10.24" y1="13.46" x2="9.77" y2="13.3" stroke="#111" strokeWidth="1"/>
              <polygon points="15,9.5 8.53,4.8 11,-2.8 19,-2.8 21.47,4.8" fill="#111"/>
              <polygon points="20.23,13.3 22.7,5.7 30.7,5.7 33.17,13.3 26.7,18" fill="#111"/>
              <polygon points="18.24,19.46 26.24,19.46 28.71,27.06 22.24,31.76 15.77,27.06" fill="#111"/>
              <polygon points="11.76,19.46 14.23,27.06 7.76,31.76 1.29,27.06 3.76,19.46" fill="#111"/>
              <polygon points="9.77,13.3 3.3,18 -3.17,13.3 -0.7,5.7 7.3,5.7" fill="#111"/>
            </g>
            <circle cx="15" cy="15" r="13.5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.75"/>
          </svg>
          <div className="flex flex-col leading-none">
            <span className="font-black text-[15px] tracking-tight text-white">Soccer<span className="text-fifa-gold">Picks</span></span>
            <span className="text-[9px] font-bold tracking-[0.2em] text-white/55 uppercase mt-0.5">WC 2026</span>
          </div>
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
                  {isEmojiAvatar(activeGroup?.avatar) ? (
                    <span className="w-[18px] h-[18px] rounded-full bg-white/30 flex items-center justify-center text-[12px] leading-none" aria-hidden>
                      {activeGroup?.avatar}
                    </span>
                  ) : activeGroup?.avatar ? (
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
                          {isEmojiAvatar(g.avatar) ? (
                            <span className="w-6 h-6 rounded-full bg-blue-50 text-base flex items-center justify-center shrink-0" aria-hidden>
                              {g.avatar}
                            </span>
                          ) : g.avatar ? (
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
                    href={`/groups/${activeGroupId}`}
                    className={`px-3 py-1.5 rounded-md transition font-medium ${
                      pathname === `/groups/${activeGroupId}`
                        ? "text-white bg-white/20 font-semibold"
                        : "text-blue-200 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    Dashboard
                  </Link>
                  {!isVisitorAdmin && (
                    <Link
                      href={`/groups/${activeGroupId}/matches`}
                      className={`px-3 py-1.5 rounded-md transition font-medium ${
                        pathname.startsWith(`/groups/${activeGroupId}/matches`) || subPage === "matches"
                          ? "text-white bg-white/20 font-semibold"
                          : "text-blue-200 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      Matches
                    </Link>
                  )}
                  <Link
                    href={`/groups/${activeGroupId}/leaderboard`}
                    className={`px-3 py-1.5 rounded-md transition font-medium ${
                      pathname.startsWith(`/groups/${activeGroupId}/leaderboard`) || subPage === "leaderboard"
                        ? "text-white bg-white/20 font-semibold"
                        : "text-blue-200 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    🏆 Leaderboard
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

          {(session?.user?.role === "ADMIN" || session?.user?.role === "GROUP_ADMIN") && (
            <>
              <Link
                href="/admin?tab=groups"
                className={`px-3 py-1.5 rounded-md transition font-semibold ${
                  pathname.startsWith("/admin") ? "text-fifa-gold bg-white/10" : "text-fifa-gold hover:brightness-110"
                }`}
              >
                Manage Groups
              </Link>
              <Link
                href="/admin"
                className={`relative px-3 py-1.5 rounded-md transition font-semibold ${
                  pathname.startsWith("/admin") ? "text-fifa-gold bg-white/10" : "text-fifa-gold hover:brightness-110"
                }`}
              >
                Admin
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
            </>
          )}
        </div>

        {/* Auth */}
        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              <NotificationCenter />
              <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition">
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name ?? "User"}
                    width={32}
                    height={32}
                    className="rounded-full border-2 border-white/30"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-sm font-bold">
                    {(session.user?.name ?? session.user?.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-blue-200 max-w-[120px] truncate">
                  {session.user?.name ?? session.user?.email}
                </span>
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-blue-300 hover:text-white transition"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="bg-fifa-gold text-gray-900 px-4 py-1.5 rounded-md text-sm font-bold hover:brightness-110 transition shadow-sm">
              Sign In
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden w-11 h-11 flex items-center justify-center -mr-2" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#001f3f] border-t border-white/10 px-4 py-3 space-y-1 text-sm">
          {session && hasGroups && activeGroupId && (
            <>
              {/* Active group label */}
              <p className="text-blue-300 text-xs font-semibold uppercase pt-1 pb-1 tracking-wide">
                {activeGroup?.name ?? "Current Group"}
              </p>
              <Link href={`/groups/${activeGroupId}`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              {!isVisitorAdmin && (
                <Link href={`/groups/${activeGroupId}/matches`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Matches</Link>
              )}
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

          {(session?.user?.role === "ADMIN" || session?.user?.role === "GROUP_ADMIN") && (
            <>
              <Link href="/admin?tab=groups" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Manage Groups</Link>
              <Link href="/admin" className="flex items-center gap-2 py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>
                Admin
                {pendingCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
            </>
          )}
          {session ? (
            <div className="flex items-center justify-between py-2">
              <button onClick={() => signOut({ callbackUrl: "/" })} className="text-red-300 hover:text-red-100 text-sm">Sign Out</button>
              <NotificationCenter />
            </div>
          ) : (
            <Link href="/login" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Sign In</Link>
          )}
        </div>
      )}
    </nav>
  );
}
