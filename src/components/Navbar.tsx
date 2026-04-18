"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export function Navbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-fifa-blue text-white shadow-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span>⚽</span>
          <span className="hidden sm:inline">WC2026</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/matches" className="text-blue-200 hover:text-white transition">
            Matches
          </Link>
          <Link href="/leaderboard" className="text-blue-200 hover:text-white transition">
            Leaderboard
          </Link>
          {session && (
            <Link href="/dashboard" className="text-blue-200 hover:text-white transition">
              Dashboard
            </Link>
          )}
          {session?.user?.role === "ADMIN" && (
            <Link href="/admin" className="text-fifa-gold hover:brightness-110 transition font-semibold">
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
        <div className="md:hidden bg-blue-900 border-t border-blue-700 px-4 py-3 space-y-2 text-sm">
          <Link href="/matches" className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Matches</Link>
          <Link href="/leaderboard" className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Leaderboard</Link>
          {session && (
            <Link href="/dashboard" className="block py-2 text-blue-200 hover:text-white" onClick={() => setMenuOpen(false)}>Dashboard</Link>
          )}
          {session?.user?.role === "ADMIN" && (
            <Link href="/admin" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Admin</Link>
          )}
          {session ? (
            <button onClick={() => signOut({ callbackUrl: "/" })} className="block py-2 text-red-300 hover:text-red-100">
              Sign Out
            </button>
          ) : (
            <Link href="/login" className="block py-2 text-fifa-gold font-semibold" onClick={() => setMenuOpen(false)}>Sign In</Link>
          )}
        </div>
      )}
    </nav>
  );
}
