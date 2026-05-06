"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getFlag } from "@/lib/flags";
import Image from "next/image";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";

interface CarouselMatch {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  group: string | null;
  round: string;
  city: string;
  kickoff: string;
  status: string;
}

interface CarouselPrediction {
  homeScore: number;
  awayScore: number;
}

interface GroupPredictionEntry {
  userId: string;
  userName: string;
  userImage: string | null;
  homeScore: number;
  awayScore: number;
  points: number | null;
  isCurrentUser: boolean;
}

interface Props {
  groupId: string;
  matches: CarouselMatch[];
  predictions: Record<string, CarouselPrediction>;
  nowMs?: number;
}

function LockCountdown({ kickoffMs }: { kickoffMs: number }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const lockMs = kickoffMs - 60 * 60 * 1000;
    const showAtMs = lockMs - 2 * 60 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const now = Date.now();
      const remaining = lockMs - now;
      if (remaining <= 0 || now < showAtMs) { setLabel(null); return; }
      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      setLabel(h > 0 ? `Locks in ${h}h ${m}m` : `Locks in ${m}m`);
      const minsLeft = remaining / 60_000;
      timeoutId = setTimeout(tick, minsLeft <= 30 ? 60_000 : 10 * 60_000);
    };

    tick();
    return () => clearTimeout(timeoutId);
  }, [kickoffMs]);

  if (!label) return null;
  return <span className="text-xs font-semibold text-orange-500 animate-pulse">{label}</span>;
}

export function MatchCarousel({ groupId, matches, predictions: initialPredictions, nowMs }: Props) {
  const [current, setCurrent] = useState(0);
  const [now, setNow] = useState(nowMs ?? Date.now());

  // Auto-refresh every 60s for live/lock state
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Deep-link support: if the URL hash is #match-<id>, scroll the carousel
  // to that match. Fires on initial mount and on subsequent hashchange events.
  useEffect(() => {
    const syncFromHash = () => {
      const m = window.location.hash.match(/^#match-(.+)$/);
      if (!m) return;
      const idx = matches.findIndex((x) => x.id === m[1]);
      if (idx >= 0) setCurrent(idx);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [matches]);

  // Swipe support — touch users expect to flick between matches, not hunt for
  // the small ‹ › buttons. Tracks both X and Y so vertical scrolling doesn't
  // accidentally trigger a horizontal swipe.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD = 50; // px; below this it's a tap, not a swipe
  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    // Don't capture swipes that start on a form input or button — the user
    // probably means to focus / press, not navigate.
    if (target.closest("input, textarea, button, select, a")) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    // Require horizontal-dominant swipe past threshold
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0 && current > 0) setCurrent((c) => c - 1);
    else if (dx < 0 && current < matches.length - 1) setCurrent((c) => c + 1);
  }

  // Keyboard navigation parity with the on-screen arrow buttons. Active when
  // the wrapper is focused. Skipped if the user is typing in a field — they
  // probably mean to edit a score, not navigate.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.matches("input, textarea, select")) return;
    if (e.key === "ArrowLeft" && current > 0) {
      e.preventDefault();
      setCurrent((c) => c - 1);
    } else if (e.key === "ArrowRight" && current < matches.length - 1) {
      e.preventDefault();
      setCurrent((c) => c + 1);
    }
  }
  const [preds, setPreds] = useState(initialPredictions);
  const [inputs, setInputs] = useState<Record<string, { home: string; away: string }>>(() => {
    const map: Record<string, { home: string; away: string }> = {};
    matches.forEach((m) => {
      const p = initialPredictions[m.id];
      map[m.id] = { home: p ? String(p.homeScore) : "", away: p ? String(p.awayScore) : "" };
    });
    return map;
  });
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 5-second undo grace period for prediction withdrawal
  const [withdrawPending, setWithdrawPending] = useState<Record<string, boolean>>({});
  const [withdrawCountdown, setWithdrawCountdown] = useState<Record<string, number>>({});
  const withdrawTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const withdrawTickRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // "See picks" expand state
  const [expanded, setExpanded] = useState(false);
  const [groupPreds, setGroupPreds] = useState<GroupPredictionEntry[] | null>(null);
  const [loadingPreds, setLoadingPreds] = useState(false);

  const total = matches.length;

  const parseScore = (val: string) => (val.trim() === "" ? 0 : parseInt(val, 10));

  const handleInitWithdraw = useCallback((matchId: string) => {
    setErrors((e) => ({ ...e, [matchId]: "" }));
    setWithdrawPending((p) => ({ ...p, [matchId]: true }));
    setWithdrawCountdown((p) => ({ ...p, [matchId]: 5 }));

    withdrawTickRef.current[matchId] = setInterval(() => {
      setWithdrawCountdown((p) => ({ ...p, [matchId]: Math.max(0, (p[matchId] ?? 1) - 1) }));
    }, 1000);

    withdrawTimerRef.current[matchId] = setTimeout(async () => {
      clearInterval(withdrawTickRef.current[matchId]);
      setWithdrawPending((p) => ({ ...p, [matchId]: false }));
      try {
        const res = await fetch(`/api/predictions?matchId=${matchId}&groupId=${groupId}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error);
        setPreds((p) => { const n = { ...p }; delete n[matchId]; return n; });
        setInputs((i) => ({ ...i, [matchId]: { home: "", away: "" } }));
      } catch (err: unknown) {
        setErrors((e) => ({ ...e, [matchId]: (err as Error).message ?? "Failed" }));
      }
    }, 5000);
  }, [groupId]);

  const handleUndoWithdraw = useCallback((matchId: string) => {
    clearTimeout(withdrawTimerRef.current[matchId]);
    clearInterval(withdrawTickRef.current[matchId]);
    setWithdrawPending((p) => ({ ...p, [matchId]: false }));
  }, []);

  const handleSave = useCallback(async (matchId: string) => {
    const inp = inputs[matchId];
    const h = parseScore(inp?.home ?? "");
    const a = parseScore(inp?.away ?? "");
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      setErrors((e) => ({ ...e, [matchId]: "Enter valid scores" }));
      return;
    }
    setErrors((e) => ({ ...e, [matchId]: "" }));
    setSaving((s) => ({ ...s, [matchId]: true }));
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, groupId, homeScore: h, awayScore: a }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setPreds((p) => ({ ...p, [matchId]: { homeScore: h, awayScore: a } }));
      setSaved((s) => ({ ...s, [matchId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [matchId]: false })), 2000);
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, [matchId]: (err as Error).message ?? "Failed" }));
    } finally {
      setSaving((s) => ({ ...s, [matchId]: false }));
    }
  }, [inputs]);

  // Cleanup withdraw timers on unmount
  useEffect(() => {
    const timers = withdrawTimerRef.current;
    const ticks = withdrawTickRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      Object.values(ticks).forEach(clearInterval);
    };
  }, []);

  // Reset expand state when navigating to different match
  useEffect(() => {
    setExpanded(false);
    setGroupPreds(null);
  }, [current]);

  // Fetch group predictions when expanded
  useEffect(() => {
    if (!expanded || groupPreds !== null) return;
    const match = matches[current];
    if (!match) return;
    setLoadingPreds(true);
    fetch(`/api/matches/${match.id}/predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data) => {
        setGroupPreds(Array.isArray(data) ? data : []);
        setLoadingPreds(false);
      })
      .catch(() => setLoadingPreds(false));
  }, [expanded, groupPreds, current, matches, groupId]);

  if (total === 0) {
    return (
      <div className="text-center text-gray-400 py-8 text-sm">
        No upcoming matches to predict.
      </div>
    );
  }

  const UNUSUAL_THRESHOLD = 7;

  const match = matches[current];
  const kickoff = new Date(match.kickoff);
  const kickoffMs = kickoff.getTime();
  const locked = now >= kickoffMs - 60 * 60 * 1000;
  const isLive = now >= kickoffMs && match.status !== "FINISHED";
  const finished = match.status === "FINISHED";
  const hasPred = !!preds[match.id];
  const inp = inputs[match.id] ?? { home: "", away: "" };

  const ch = parseScore(inp.home);
  const ca = parseScore(inp.away);
  const carouselWarning =
    !isNaN(ch) && !isNaN(ca) && (ch > 20 || ca > 20)
      ? "Score over 20 — looks like a typo."
      : !isNaN(ch) && !isNaN(ca) && (ch >= UNUSUAL_THRESHOLD || ca >= UNUSUAL_THRESHOLD)
      ? "Unusually high score — double-check before saving."
      : null;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="match carousel"
      aria-label={`Match ${current + 1} of ${matches.length}`}
      className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-fifa-blue focus-visible:ring-offset-2"
    >
      {/* Card — mirrors MatchCard layout */}
      <div className="card flex flex-col gap-3">

        {/* Header */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="shrink-0">{match.group ? `Group ${match.group}` : match.round} · #{match.matchNumber}</span>
            {isLive && (
              <span className="badge bg-red-500 text-white flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            )}
            {!isLive && hasPred && !locked && !finished && (
              <span className="badge bg-green-100 text-green-700 font-semibold shrink-0">✓ Predicted</span>
            )}
          </span>
          <span className="truncate max-w-[120px] text-right ml-2 shrink-0">{match.city}</span>
        </div>

        {/* Teams — vertical, flag + name + input inline */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl shrink-0">{getFlag(match.homeTeam) || "　"}</span>
            <span className="font-semibold text-gray-800 text-sm flex-1 min-w-0 truncate">{match.homeTeam}</span>
            {locked && hasPred && (
              <span className="text-sm font-medium text-orange-500 tabular-nums shrink-0">{preds[match.id].homeScore}</span>
            )}
            {!locked && (
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={inp.home}
                onChange={(e) => setInputs((i) => ({ ...i, [match.id]: { ...i[match.id], home: e.target.value } }))}
                className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue shrink-0"
                placeholder="0"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl shrink-0">{getFlag(match.awayTeam) || "　"}</span>
            <span className="font-semibold text-gray-800 text-sm flex-1 min-w-0 truncate">{match.awayTeam}</span>
            {locked && hasPred && (
              <span className="text-sm font-medium text-orange-500 tabular-nums shrink-0">{preds[match.id].awayScore}</span>
            )}
            {!locked && (
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={inp.away}
                onChange={(e) => setInputs((i) => ({ ...i, [match.id]: { ...i[match.id], away: e.target.value } }))}
                className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue shrink-0"
                placeholder="0"
              />
            )}
          </div>
        </div>

        {/* Date / lock countdown */}
        <div className="text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          {!locked && <LockCountdown kickoffMs={kickoffMs} />}
          <span>
            {kickoff.toLocaleDateString("en-US", {
              month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit", timeZoneName: "short",
            })}
          </span>
        </div>

        {/* Action row */}
        <div className="border-t border-gray-100 pt-2 flex flex-col gap-1.5">
          {locked ? (
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${hasPred ? "text-orange-500" : "text-red-500"}`}>
                🔒 {hasPred ? "Locked" : "Locked — no prediction submitted"}
              </span>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-600 transition min-h-[44px] px-2 flex items-center"
              >
                {expanded ? "▲ Hide" : "▼ See picks"}
              </button>
            </div>
          ) : (
            <>
              {withdrawPending[match.id] ? (
                <div className="border border-orange-100 bg-orange-50 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="text-xs text-orange-600 flex-1">
                    Prediction withdrawn ({withdrawCountdown[match.id] ?? 0}s)
                  </span>
                  <button
                    onClick={() => handleUndoWithdraw(match.id)}
                    className="text-xs font-semibold text-fifa-blue hover:underline"
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSave(match.id)}
                    disabled={saving[match.id]}
                    className="btn-primary text-xs px-3 py-1.5 flex-1"
                  >
                    {saving[match.id] ? "..." : saved[match.id] ? "Saved ✓" : "Save"}
                  </button>
                  {hasPred && (
                    <button
                      onClick={() => handleInitWithdraw(match.id)}
                      title="Withdraw prediction"
                      className="w-11 h-11 flex items-center justify-center rounded-full border border-red-200 text-red-400 hover:bg-red-50 hover:border-red-400 hover:text-red-600 transition shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
              {carouselWarning && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span>⚠️</span> {carouselWarning}
                </p>
              )}
              {errors[match.id] && <p className="text-xs text-red-500">{errors[match.id]}</p>}
            </>
          )}
        </div>

        {/* Group predictions expand */}
        {locked && expanded && (
          <div className="border-t border-gray-100 pt-2">
            <p className="text-xs text-gray-400 mb-2">Sealed predictions</p>
            {loadingPreds ? (
              <SkeletonRow label="Loading group predictions">
                <div className="grid grid-cols-3 gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} variant="rect" height={28} />
                  ))}
                </div>
              </SkeletonRow>
            ) : !groupPreds || groupPreds.length === 0 ? (
              <div className="text-xs text-gray-400 italic text-center py-1">No predictions submitted.</div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {groupPreds.map((e) => (
                  <div
                    key={e.userId}
                    className={`rounded-md p-1.5 flex flex-col items-center gap-0.5 text-center ${
                      e.isCurrentUser ? "bg-blue-50 ring-1 ring-fifa-blue" : "bg-gray-50"
                    }`}
                  >
                    {e.userImage ? (
                      <Image src={e.userImage} alt={e.userName} width={20} height={20} className="rounded-full" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-fifa-blue text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                        {(e.userName.match(/[a-zA-Z]/) ?? ["?"])[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-[10px] text-gray-600 truncate max-w-full leading-tight">
                      {e.isCurrentUser ? "You" : e.userName}
                    </span>
                    <span className="text-xs font-bold text-gray-800 tabular-nums">
                      {e.homeScore}–{e.awayScore}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-30"
        >
          ‹
        </button>

        {/* Dot indicators — rolling window so the row never overflows the card */}
        {(() => {
          const MAX_DOTS = 9;
          const windowStart = matches.length <= MAX_DOTS
            ? 0
            : Math.max(0, Math.min(current - Math.floor(MAX_DOTS / 2), matches.length - MAX_DOTS));
          const windowEnd = Math.min(matches.length, windowStart + MAX_DOTS);
          const visible = matches.slice(windowStart, windowEnd);
          return (
            <div className="flex gap-1.5 items-center">
              {windowStart > 0 && <span className="text-gray-300 text-xs leading-none">…</span>}
              {visible.map((m) => {
                const i = matches.indexOf(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => setCurrent(i)}
                    className="flex items-center justify-center w-11 h-11 rounded-full"
                    aria-label={`Match ${i + 1}`}
                  >
                    <span className={`rounded-full transition-all block ${
                      i === current
                        ? "bg-fifa-blue w-5 h-2"
                        : preds[m.id]
                        ? "bg-green-400 w-2 h-2"
                        : "bg-gray-200 w-2 h-2"
                    }`} />
                  </button>
                );
              })}
              {windowEnd < matches.length && <span className="text-gray-300 text-xs leading-none">…</span>}
            </div>
          );
        })()}

        <button
          onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
          disabled={current === total - 1}
          className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <p className="text-center text-xs text-gray-400 mt-1">{current + 1} of {total}</p>
    </div>
  );
}
