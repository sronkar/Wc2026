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
          {/* Soccer ball — OpenMoji ⚽ geometry, tilted -20° */}
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
            <defs>
              <clipPath id="sb">
                <circle cx="15" cy="15" r="13.5"/>
              </clipPath>
            </defs>
            <circle cx="15" cy="15" r="13.5" fill="white" fillOpacity="0.93"/>
            <g clipPath="url(#sb)">
              {/* translate(15,15) · scale(13.5/29) · rotate(-20°) · translate(-36,-36) */}
              <g transform="matrix(0.43742,-0.15921,0.15921,0.43742,-6.479,4.985)">
                <g transform="translate(34.24,34.55) scale(1.15) translate(-34.24,-34.55)">
                  <path fill="#111" d="M34.2366,28.0728l-6.1555,4.4722c-1.0515,0.7639-1.4914,2.118-1.0898,3.3541l2.3512,7.2362c0.4016,1.2361,1.5535,2.0729,2.8532,2.0729h7.6086c1.2997,0,2.4515-0.8369,2.8532-2.0729l2.3512-7.2362c0.4016-1.2361-0.0383-2.5902-1.0898-3.3541l-6.1555-4.4722C36.7119,27.3089,35.2881,27.3089,34.2366,28.0728z"/>
                </g>
                <path fill="#111" d="M46.28,10.18l-8.41,4.12c-0.59,0.28-1.23,0.42-1.87,0.41c-0.57-0.0099-1.14-0.14-1.68-0.39l-8.61-4.1c-0.42-0.2-0.64-0.67-0.56-1.11C28.5,7.74,32.16,7,36,7c3.83,0,7.49,0.74,10.83,2.1C46.91,9.53,46.7,9.98,46.28,10.18z"/>
                <path fill="#111" d="M15.16,31.37c-0.14,0.58-0.41,1.13-0.79,1.61l-5.9,7.3c-0.28,0.34-0.73,0.46-1.11,0.33C7.12,39.11,7,37.57,7,36c0-6.17,1.92-11.89,5.22-16.59c0.42,0.05,0.79,0.35,0.88,0.79l2.08,9.33C15.32,30.14,15.31,30.77,15.16,31.37z"/>
                <path fill="#111" d="M30.51,64.48c-0.47-0.09-0.94-0.19-1.41-0.31c-0.19-0.04-0.39-0.09-0.58-0.14c-0.26-0.07-0.52-0.15-0.78-0.23c-0.23-0.07-0.47-0.14-0.71-0.22c-0.2401-0.0699-0.47-0.15-0.7-0.24c-0.19-0.07-0.38-0.14-0.57-0.21c-0.11-0.03-0.21-0.07-0.32-0.12c-0.39-0.16-0.78-0.32-1.16-0.4901c-0.522-0.2304-1.0333-0.4806-1.5386-0.741c-0.2299-0.1179-0.4554-0.2423-0.6817-0.3661c-0.2557-0.1407-0.509-0.2849-0.7601-0.4332c-0.2823-0.1659-0.5635-0.3326-0.8397-0.5077c-0.0818-0.0522-0.1609-0.108-0.2422-0.161c-3.1296-2.0298-5.849-4.6387-7.9878-7.691c0.19-0.34,0.58-0.55,1.01-0.5l9.34,1.14c0.64,0.08,1.24,0.3,1.76,0.65c0.49,0.33,0.91,0.76,1.22,1.27l2.82,4.59l2.19,3.58C30.79,63.71,30.76,64.16,30.51,64.48z"/>
                <path fill="#111" d="M59.72,52.67c0,0,0,0,0,0.01c-4.24,6.03-10.73,10.37-18.24,11.8c-0.26-0.32-0.29-0.78-0.07-1.15L46.4,55.19c0.3199-0.52,0.74-0.95,1.24-1.28c0.52-0.34,1.11-0.56,1.74-0.64l9.31-1.14C59.13,52.08,59.53,52.31,59.72,52.67z"/>
                <path fill="#111" d="M65,36c0,1.61-0.13,3.19-0.39,4.73c-0.36,0.08-0.75-0.04-1-0.35l-5.25-6.5l-0.73-0.9c-0.78-0.96-1.08-2.23-0.8-3.45l1.06-4.75v-0.01l1.04-4.69c0.08-0.39,0.39-0.6899,0.77-0.77c0-0.01,0-0.01,0.01,0c0.5,0.69,0.97,1.42,1.39,2.17c0.15,0.25,0.29,0.5,0.4301,0.76c0.17,0.31,0.33,0.61,0.47,0.92c0.11,0.21,0.21,0.42,0.31,0.64c0.16,0.32,0.3,0.64,0.43,0.96c0.16,0.36,0.3,0.72,0.43,1.09c0.11,0.28,0.21,0.56,0.3,0.85c0.08,0.23,0.16,0.47,0.2401,0.72c0.1,0.32,0.19,0.64,0.28,0.96c0.06,0.23,0.12,0.45,0.17,0.68c0.1801,0.71,0.33,1.42,0.44,2.15c0.04,0.21,0.07,0.42,0.1,0.64c0.05,0.32,0.09,0.65,0.12,0.97c0.02,0.14,0.04,0.28,0.05,0.41c0.03,0.35,0.06,0.7,0.07,1.06c0.02,0.15,0.03,0.29,0.03,0.44C64.99,35.15,65,35.57,65,36z"/>
                <line x1="36" y1="14.7122" x2="36" y2="27.4999" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                <line x1="44.9889" y1="33.9902" x2="56.8125" y2="31.3266" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                <line x1="41.5906" y1="44.6172" x2="47.6376" y2="53.9126" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                <line x1="30.394" y1="44.6059" x2="24.3434" y2="53.9126" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
                <line x1="27.0013" y1="34.0188" x2="15.1636" y2="31.3728" stroke="#111" strokeWidth="2" strokeLinecap="round"/>
              </g>
            </g>
            <path d="M 10.6,16 L 13.3,18.7 L 19.2,13" stroke="rgba(255,255,255,0.75)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M 10.6,16 L 13.3,18.7 L 19.2,13" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
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
