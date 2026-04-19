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
  const dropRef = useRef<HTMLDivElement>(null);

  // Extract current group id from pathname like /groups/[id]/...
  const groupIdMatch = pathname.match(/^\/groups\/([^/]+)/);
  const currentGroupId = groupIdMatch?.[1] ?? null;
  const currentGroup = myGroups.find((g) => g.id === currentGroupId) ?? null;

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/user/groups")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setMyGroups(data); })
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

  return (
    <nav className="bg-fifa-blue text-white shadow-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href={currentGroupId ? `/groups/${currentGroupId}` : (myGroups[0] ? `/groups/${myGroups[0].id}` : "/")} className="flex items-center gap-2 font-bold text-lg">
          <span>⚽</span>
          <span className="hidden sm:inline">WC2026</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          {/* Group switcher */}
          {session && myGroups.length > 0 && (
            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setGroupDropOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition text-sm font-semibold"
              >
                {currentGroup?.avatar ? (
                  <Image src={currentGroup.avatar} alt="" width={18} height={18} className="rounded-full object-cover" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-xs font-bold">
                    {(currentGroup?.name ?? myGroups[0]?.name ?? "G").charAt(0)}
                  </span>
                )}
                <span className="max-w-[120px] truncate">
                  {currentGroup?.name ?? myGroups[0]?.name ?? "Groups"}
                </span>
                <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {groupDropOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 min-w-[200px] z-50 overflow-hidden">
                  <p className="text-xs text-gray-400 px-3 pt-2.5 pb-1 font-semibold uppercase tracking-wide">My Groups</p>
                  {myGroups.map((g) => (
                    <Link
                      key={g.id}
                      href={`/groups/${g.id}`}
                      onClick={() => setGroupDropOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition text-sm ${
                        g.id === currentGroupId ? "bg-blue-50 text-fifa-blue font-semibold" : "text-gray-800"
                      }`}
                    >
                      {g.avatar ? (
                        <Image src={g.avatar} alt="" width={24} height={24} className="rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-fifa-blue text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {g.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate">{g.name}</span>
                      {g.id === currentGroupId && <span className="ml-auto text-fifa-blue">✓</span>}
                    </Link>
                  ))}
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
          )}

          {session && myGroups.length === 0 && (
            <Link href="/groups" className="text-blue-200 hover:text-white transition">Groups</Link>
          )}

          {currentGroupId && (
            <>
              <Link href={`/groups/${currentGroupId}/matches`} className="text-blue-200 hover:text-white transition">
                Matches
              </Link>
              <Link href={`/groups/${currentGroupId}/leaderboard`} className="text-blue-200 hover:text-white transition">
                Leaderboard
              </Link>
            </>
          )}

          {session?.user?.role === "ADMIN" || session?.user?.role === "SUB_ADMIN" ? (
            <Link href="/admin" className="text-fifa-gold hover:brightness-110 transition font-semibold">
              Admin
            </Link>
          ) : null}
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
        <div className="md:hidden bg-blue-900 border-t border-blue-700 px-4 py-3 space-y-2 text-sm">
          {session && currentGroupId && (
            <>
              <p className="text-blue-300 text-xs font-semibold uppercase pt-1 pb-0.5">
                {currentGroup?.name ?? "Current group"}
              </p>
              <Link href={`/groups/${currentGroupId}`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <Link href={`/groups/${currentGroupId}/matches`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Matches</Link>
              <Link href={`/groups/${currentGroupId}/leaderboard`} className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Leaderboard</Link>
            </>
          )}
          {session && myGroups.length > 1 && (
            <>
              <p className="text-blue-300 text-xs font-semibold uppercase pt-2 pb-0.5">Switch Group</p>
              {myGroups.filter((g) => g.id !== currentGroupId).map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`} className="block py-1.5 text-blue-200 hover:text-white truncate" onClick={() => setMenuOpen(false)}>
                  {g.name}
                </Link>
              ))}
            </>
          )}
          <Link href="/groups" className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>All Groups</Link>
          {(session?.user?.role === "ADMIN" || session?.user?.role === "SUB_ADMIN") && (
            <Link href="/admin" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Admin</Link>
          )}
          {session ? (
            <button onClick={() => signOut({ callbackUrl: "/" })} className="block py-2 text-red-300 hover:text-red-100">Sign Out</button>
          ) : (
            <Link href="/login" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Sign In</Link>
          )}
        </div>
      )}
    </nav>
  );
}
