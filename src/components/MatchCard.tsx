"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { getFlag } from "@/lib/flags";

interface Match {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  group: string | null;
  round: string;
  venue: string;
  city: string;
  kickoff: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

interface Prediction {
  homeScore: number;
  awayScore: number;
  points: number | null;
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
  match: Match;
  prediction?: Prediction;
  onSave?: (matchId: string, home: number, away: number) => Promise<void>;
  onCancel?: (matchId: string) => Promise<void>;
  isLoggedIn: boolean;
  groupId?: string;
  nowMs?: number;
}

const UNUSUAL_THRESHOLD = 7;

function unrealisticWarning(h: number, a: number): string | null {
  if (h > 20 || a > 20) return "Score over 20 — looks like a typo.";
  if (h >= UNUSUAL_THRESHOLD || a >= UNUSUAL_THRESHOLD)
    return "Unusually high score for international football — double-check before saving.";
  return null;
}

// Shows "Locks in Xh Ym" starting 2 hours before lock, updating every 10min then every 1min
function LockCountdown({ kickoffMs }: { kickoffMs: number }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const lockMs = kickoffMs - 60 * 60 * 1000;
    const showAtMs = lockMs - 2 * 60 * 60 * 1000; // 2hr before lock = 3hr before kickoff

    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const now = Date.now();
      const remaining = lockMs - now;

      if (remaining <= 0 || now < showAtMs) {
        setLabel(null);
        return;
      }

      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      setLabel(h > 0 ? `Locks in ${h}h ${m}m` : `Locks in ${m}m`);

      // Switch to 1-min updates when < 30min to lock
      const minsLeft = remaining / 60_000;
      timeoutId = setTimeout(tick, minsLeft <= 30 ? 60_000 : 10 * 60_000);
    };

    tick();
    return () => clearTimeout(timeoutId);
  }, [kickoffMs]);

  if (!label) return null;
  return (
    <span className="text-xs font-semibold text-orange-500 animate-pulse">{label}</span>
  );
}

export function MatchCard({ match, prediction, onSave, onCancel, isLoggedIn, groupId, nowMs }: Props) {
  const [homeInput, setHomeInput] = useState<string>(
    prediction !== undefined ? String(prediction.homeScore) : ""
  );
  const [awayInput, setAwayInput] = useState<string>(
    prediction !== undefined ? String(prediction.awayScore) : ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [withdrawCountdown, setWithdrawCountdown] = useState(5);
  const withdrawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const withdrawTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState("");
  const [groupPredictions, setGroupPredictions] = useState<GroupPredictionEntry[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(nowMs ?? Date.now());

  // Auto-refresh every 60s to update live/lock state
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const kickoff = new Date(match.kickoff);
  const kickoffMs = kickoff.getTime();
  const locked = now >= kickoffMs - 60 * 60 * 1000;
  const finished = match.status === "FINISHED";
  const isLive = now >= kickoffMs && !finished;

  // hasPred: treat as no prediction while withdraw is pending (optimistic UI)
  const hasPred = prediction !== undefined && !withdrawPending;
  const isExact = finished && hasPred && match.homeScore === prediction!.homeScore && match.awayScore === prediction!.awayScore;
  const isWinner = finished && hasPred && prediction!.points !== null && prediction!.points > 0 && !isExact;
  const isMiss = finished && hasPred && prediction!.points !== null && prediction!.points === 0;

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (withdrawTimerRef.current) clearTimeout(withdrawTimerRef.current);
      if (withdrawTickRef.current) clearInterval(withdrawTickRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // Lazy-fetch group predictions when expanded
  useEffect(() => {
    if (!expanded || !groupId || (!locked && !finished)) return;
    if (groupPredictions.length > 0) return;
    setLoadingGroup(true);
    fetch(`/api/matches/${match.id}/predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data) => {
        setGroupPredictions(Array.isArray(data) ? data : []);
        setLoadingGroup(false);
      })
      .catch(() => setLoadingGroup(false));
  }, [expanded, groupId, match.id, locked, finished, groupPredictions.length]);

  const parseScore = (val: string) => (val.trim() === "" ? 0 : parseInt(val, 10));
  const h = parseScore(homeInput);
  const a = parseScore(awayInput);
  const inputsValid = !isNaN(h) && !isNaN(a) && h >= 0 && a >= 0;
  const warning = inputsValid ? unrealisticWarning(h, a) : null;

  const handleWithdraw = () => {
    // Optimistically clear inputs and show undo state
    setHomeInput("");
    setAwayInput("");
    setWithdrawPending(true);
    setWithdrawCountdown(5);

    // Countdown ticker for UI
    withdrawTickRef.current = setInterval(() => {
      setWithdrawCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    // After 5s, fire the actual delete
    withdrawTimerRef.current = setTimeout(async () => {
      if (withdrawTickRef.current) clearInterval(withdrawTickRef.current);
      setWithdrawPending(false);
      setCancelling(true);
      setError("");
      try {
        await onCancel!(match.id);
      } catch {
        setError("Failed to withdraw. Try again.");
        // Restore inputs if delete failed
        if (prediction) {
          setHomeInput(String(prediction.homeScore));
          setAwayInput(String(prediction.awayScore));
        }
      } finally {
        setCancelling(false);
      }
    }, 5000);
  };

  const handleUndoWithdraw = () => {
    if (withdrawTimerRef.current) {
      clearTimeout(withdrawTimerRef.current);
      withdrawTimerRef.current = null;
    }
    if (withdrawTickRef.current) {
      clearInterval(withdrawTickRef.current);
      withdrawTickRef.current = null;
    }
    setWithdrawPending(false);
    // Restore inputs
    if (prediction) {
      setHomeInput(String(prediction.homeScore));
      setAwayInput(String(prediction.awayScore));
    }
  };

  const scheduleAutoSave = (homeStr: string, awayStr: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!homeStr.trim() || !awayStr.trim() || !onSave) return;
    const hs = parseInt(homeStr.trim(), 10);
    const as_ = parseInt(awayStr.trim(), 10);
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) return;
    if (unrealisticWarning(hs, as_)) return;
    autoSaveTimerRef.current = setTimeout(async () => {
      setError("");
      setSaving(true);
      try {
        await onSave(match.id, hs, as_);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        setError("Failed to save. Try again.");
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  const resultBg = (() => {
    if (!finished) return "";
    if (!hasPred) return "!bg-gray-50 opacity-60";     // no prediction — gray out
    if (prediction!.points === null) return "";
    if (isExact) return "!bg-emerald-100 !border-emerald-500";
    if (isWinner) return "!bg-green-50 !border-green-200";
    if (isMiss) return "!bg-red-50 !border-red-200";
    return "";
  })();

  const resolutionBadge = () => {
    if (!finished || !hasPred || prediction!.points === null) return null;
    const pts = prediction!.points;
    if (isExact) {
      return (
        <span className="badge bg-emerald-600 text-white font-bold">
          Exact +{pts}pts
        </span>
      );
    }
    if (isWinner) {
      return (
        <span className="badge bg-green-100 text-green-700 border border-green-300">
          +{pts}pts
        </span>
      );
    }
    return (
      <span className="badge bg-red-100 text-red-700 border border-red-300">
        miss
      </span>
    );
  };

  const othersSummary = () => {
    if (!finished || groupPredictions.length === 0) return null;
    const others = groupPredictions.filter((e) => !e.isCurrentUser);
    if (others.length === 0) return null;
    const exactCount = others.filter(
      (e) => e.homeScore === match.homeScore && e.awayScore === match.awayScore
    ).length;
    const rightCount = others.filter(
      (e) =>
        e.points !== null &&
        e.points > 0 &&
        !(e.homeScore === match.homeScore && e.awayScore === match.awayScore)
    ).length;
    const parts: string[] = [];
    if (exactCount > 0) parts.push(`${exactCount} exact`);
    if (rightCount > 0) parts.push(`${rightCount} right`);
    if (parts.length === 0) return null;
    return <span className="text-xs text-gray-400">{parts.join(" · ")}</span>;
  };

  return (
    <div className={`card flex flex-col gap-3 ${resultBg}`}>
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1.5 min-w-0">
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

      {/* Teams */}
      <div className="flex flex-col gap-2">
        {/* Home */}
        <div className="flex items-center gap-2">
          <span className="text-xl shrink-0">{getFlag(match.homeTeam) || "　"}</span>
          <span className="font-semibold text-gray-800 text-sm flex-1 min-w-0 truncate">{match.homeTeam}</span>
          {finished ? (
            <span className="w-8 text-center text-lg font-bold text-fifa-blue tabular-nums shrink-0">
              {match.homeScore}
            </span>
          ) : locked && isLoggedIn && prediction ? (
            <span className="text-sm font-medium text-orange-500 tabular-nums shrink-0">
              {prediction.homeScore}
            </span>
          ) : !locked && isLoggedIn && onSave ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={homeInput}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2); setHomeInput(v); scheduleAutoSave(v, awayInput); }}
              className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue shrink-0"
              placeholder="–"
              aria-label={`${match.homeTeam} predicted score`}
            />
          ) : null}
        </div>

        {/* Away */}
        <div className="flex items-center gap-2">
          <span className="text-xl shrink-0">{getFlag(match.awayTeam) || "　"}</span>
          <span className="font-semibold text-gray-800 text-sm flex-1 min-w-0 truncate">{match.awayTeam}</span>
          {finished ? (
            <span className="w-8 text-center text-lg font-bold text-fifa-blue tabular-nums shrink-0">
              {match.awayScore}
            </span>
          ) : locked && isLoggedIn && prediction ? (
            <span className="text-sm font-medium text-orange-500 tabular-nums shrink-0">
              {prediction.awayScore}
            </span>
          ) : !locked && isLoggedIn && onSave ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={awayInput}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2); setAwayInput(v); scheduleAutoSave(homeInput, v); }}
              className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue shrink-0"
              placeholder="–"
              aria-label={`${match.awayTeam} predicted score`}
            />
          ) : null}
        </div>
      </div>

      {/* Date / lock countdown row */}
      {!finished && (
        <div className="text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          {!locked && <LockCountdown kickoffMs={kickoffMs} />}
          <span>
            {kickoff.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </span>
        </div>
      )}

      {/* Undo toast */}
      {withdrawPending && (
        <div className="border-t border-orange-100 pt-2 flex items-center gap-2">
          <span className="text-xs text-orange-600 flex-1">
            Prediction withdrawn ({withdrawCountdown}s)
          </span>
          <button
            onClick={handleUndoWithdraw}
            className="text-xs font-semibold text-fifa-blue hover:underline"
          >
            Undo
          </button>
        </div>
      )}

      {/* Action / status row */}
      {isLoggedIn && !withdrawPending && (
        <div className="border-t border-gray-100 pt-2 flex flex-col gap-1.5">
          {finished ? (
            <div className="flex items-center gap-2 flex-wrap">
              {hasPred ? resolutionBadge() : (
                <span className="text-xs text-gray-400 italic">No prediction submitted</span>
              )}
              {groupId && expanded && othersSummary()}
              {groupId && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  {expanded ? "▲ Hide" : "▼ Show picks"}
                </button>
              )}
            </div>
          ) : locked ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-orange-500 font-medium">
                {prediction ? "Locked" : "Locked — no prediction submitted"}
              </span>
              {groupId && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  {expanded ? "▲ Hide" : "▼ See picks"}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs">
                  {saving ? (
                    <span className="text-gray-400">Saving…</span>
                  ) : saved ? (
                    <span className="text-green-600">Saved ✓</span>
                  ) : error ? (
                    <span className="text-red-500">{error}</span>
                  ) : null}
                </span>
                <button
                  onClick={hasPred && onCancel ? handleWithdraw : undefined}
                  disabled={cancelling}
                  className={`text-xs font-medium px-2 py-1 rounded transition disabled:opacity-40 ${
                    hasPred && onCancel
                      ? "text-red-500 hover:text-red-700 hover:bg-red-50"
                      : "invisible pointer-events-none"
                  }`}
                >
                  {cancelling ? "…" : "Clear"}
                </button>
              </div>
              {warning && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span>⚠️</span> {warning}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Everyone's picks — shown when expanded */}
      {groupId && (locked || finished) && expanded && (
        <div className="border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-400 mb-2">
            {finished ? "Everyone's picks" : "Sealed predictions"}
          </p>
          {loadingGroup ? (
            <div className="text-xs text-gray-400 py-1 text-center">Loading…</div>
          ) : groupPredictions.length === 0 ? (
            <div className="text-xs text-gray-400 italic text-center py-1">No predictions submitted.</div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {groupPredictions.map((e) => {
                const eExact =
                  finished &&
                  match.homeScore !== null &&
                  e.homeScore === match.homeScore &&
                  e.awayScore === match.awayScore;
                const eRight = !eExact && e.points !== null && e.points > 0;
                const bgClass = e.isCurrentUser
                  ? "bg-blue-50 ring-1 ring-fifa-blue"
                  : eExact
                  ? "bg-emerald-100 ring-2 ring-emerald-500"
                  : eRight
                  ? "bg-green-50 ring-1 ring-green-200"
                  : "bg-gray-50";
                return (
                  <div
                    key={e.userId}
                    className={`rounded-md p-1.5 flex flex-col items-center gap-0.5 text-center ${bgClass}`}
                  >
                    {e.userImage ? (
                      <Image
                        src={e.userImage}
                        alt={e.userName}
                        width={20}
                        height={20}
                        className="rounded-full"
                      />
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
                    {finished && e.points !== null && (
                      <span
                        className={`text-[9px] font-semibold rounded px-1 ${
                          eExact
                            ? "bg-emerald-600 text-white"
                            : eRight
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {e.points > 0 ? `+${e.points}` : "0"} pts
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
