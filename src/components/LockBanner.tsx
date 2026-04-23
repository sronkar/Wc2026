"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

interface LockingMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  lockTime: string;
  hasPrediction: boolean;
}

interface BannerData {
  urgent: LockingMatch[];
  nextUnpredicted: LockingMatch[];
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

export function LockBanner() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [data, setData] = useState<BannerData>({ urgent: [], nextUnpredicted: [] });
  const [, setTick] = useState(0);

  // Derive the group ID from the URL so the "Predict" link goes to the right group
  const urlGroupId = pathname.match(/^\/groups\/([^/]+)/)?.[1] ?? null;
  const predictHref = urlGroupId ? `/groups/${urlGroupId}/matches` : "/groups";

  const fetchData = useCallback(() => {
    if (!session?.user?.id) return;
    fetch("/api/matches/locking-soon")
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.urgent)) setData(d as BannerData);
      })
      .catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5 * 60 * 1000); // re-fetch every 5 min
    return () => clearInterval(id);
  }, [fetchData]);

  // Tick every 30s to keep countdowns fresh without a fetch
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!session) return null;

  const now = Date.now();

  // Filter out already-locked urgent matches (client clock)
  const activeUrgent = data.urgent.filter((m) => new Date(m.lockTime).getTime() > now);

  // ── URGENT: matches locking within 2 hours ──
  if (activeUrgent.length > 0) {
    const unpredicted = activeUrgent.filter((m) => !m.hasPrediction);
    const hasUnpredicted = unpredicted.length > 0;
    const earliest = activeUrgent[0];
    const lockMs = new Date(earliest.lockTime).getTime() - now;
    const timeStr = formatCountdown(lockMs);

    let message: string;
    if (activeUrgent.length === 1) {
      const name = `${earliest.homeTeam} vs ${earliest.awayTeam}`;
      message = hasUnpredicted
        ? `🔒 ${name} locks in ${timeStr} — you haven't predicted yet!`
        : `🔒 ${name} locks in ${timeStr}`;
    } else {
      const unpredCount = unpredicted.length;
      message = hasUnpredicted
        ? `🔒 ${activeUrgent.length} matches lock soon (next in ${timeStr}) — ${unpredCount} without your prediction!`
        : `🔒 ${activeUrgent.length} matches locking — next in ${timeStr}`;
    }

    return (
      <div
        className={`w-full text-xs font-medium py-1.5 px-4 flex items-center justify-center gap-3 ${
          hasUnpredicted
            ? "bg-orange-500 text-white"
            : "bg-amber-50 border-b border-amber-200 text-amber-800"
        }`}
      >
        <span>{message}</span>
        {hasUnpredicted && (
          <Link href={predictHref} className="underline font-bold text-white shrink-0">
            Predict →
          </Link>
        )}
      </div>
    );
  }

  // ── SOFT REMINDER: next unpredicted match within 24h ──
  if (data.nextUnpredicted.length > 0) {
    const next = data.nextUnpredicted[0];
    const lockMs = new Date(next.lockTime).getTime() - now;
    const timeStr = formatCountdown(lockMs);
    const name = `${next.homeTeam} vs ${next.awayTeam}`;

    return (
      <div className="w-full text-xs font-medium py-1.5 px-4 flex items-center justify-center gap-3 bg-yellow-50 border-b border-yellow-200 text-yellow-800">
        <span>⏰ You haven&apos;t predicted <strong>{name}</strong> yet — locks in {timeStr}</span>
        <Link href={predictHref} className="underline font-semibold text-yellow-700 shrink-0">
          Predict →
        </Link>
      </div>
    );
  }

  return null;
}
