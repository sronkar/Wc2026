"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getFlag } from "@/lib/flags";
import { WC2026_TEAMS } from "@/lib/teams";

interface CustomPrediction {
  id: string;
  question: string;
  description: string | null;
  optionType: string;
  options: string[];
  points: number;
  lockTime: string;
  isLocked: boolean;
  isGlobal: boolean;
  status: string;
  correctOption: string | null;
  userAnswer: string | null;
  userPoints: number | null;
  totalAnswers: number;
  answerCounts: Record<string, number> | null;
  answers: { userId: string; userName: string; userImage: string | null; option: string; points: number | null }[] | null;
}

function Countdown({ lockTime }: { lockTime: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    function tick() {
      const diff = new Date(lockTime).getTime() - Date.now();
      if (diff <= 0) { setLabel("Locked"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(h > 0 ? `Locks in ${h}h ${m}m` : m > 0 ? `Locks in ${m}m ${s}s` : `Locks in ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [lockTime]);
  return <span>{label}</span>;
}

// TeamPicker: closes dropdown after selection, syncs with value prop when carousel navigates
function TeamPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  // Sync query when parent navigates to a new prediction
  useEffect(() => {
    setQuery(value);
    setOpen(false);
  }, [value]);

  const isValidTeam = value ? WC2026_TEAMS.includes(value) : false;
  const filtered = query.trim()
    ? WC2026_TEAMS.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
    : WC2026_TEAMS;

  // When a valid team is selected and dropdown is closed, show a flag pill
  if (isValidTeam && !open) {
    return (
      <button
        onClick={() => { setQuery(""); setOpen(true); }}
        className="w-full border border-fifa-blue bg-blue-50 rounded-lg px-3 py-2 text-sm text-fifa-blue font-medium flex items-center gap-2"
      >
        <span className="shrink-0 text-lg leading-none">{getFlag(value)}</span>
        <span className="flex-1 text-left">{value}</span>
        <span className="text-gray-400 text-xs shrink-0">change</span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search team…"
        autoFocus={open}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
      />
      {open && query.trim() && (
        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No teams match</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t}
                onClick={() => { setQuery(t); onChange(t); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition flex items-center gap-2 ${value === t ? "font-semibold text-fifa-blue bg-blue-50" : "text-gray-700"}`}
              >
                <span className="shrink-0">{getFlag(t) || "🏳️"}</span>
                {value === t ? "✓ " : ""}{t}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface PlayerResult {
  id: string;
  name: string;
  country: string;
  position: string | null;
  number: number | null;
}

// PlayerPicker: same fix — close dropdown after selection, sync with value
function PlayerPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(value);
    setOpen(false);
  }, [value]);

  useEffect(() => {
    if (!query.trim() || !open) { setResults([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/players?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => { setResults(Array.isArray(data) ? data : []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by player name or country…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
      />
      {open && query.trim() && (
        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {loading ? (
            <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No players found</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                onClick={() => { setQuery(p.name); onChange(p.name); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${value === p.name ? "font-semibold text-fifa-blue bg-blue-50" : "text-gray-700"}`}
              >
                <span className="font-medium">{value === p.name ? "✓ " : ""}{p.name}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {p.country}{p.position ? ` · ${p.position}` : ""}
                  {p.number ? ` · #${p.number}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function GeneralPredictionsCarousel({ groupId }: { groupId: string }) {
  const [predictions, setPredictions] = useState<CustomPrediction[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  // 5-second undo state for withdrawal
  const [withdrawPending, setWithdrawPending] = useState<Record<string, boolean>>({});
  const [withdrawCountdown, setWithdrawCountdown] = useState<Record<string, number>>({});
  const withdrawTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const withdrawTickRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    fetch(`/api/custom-predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const globals = data.filter((cp: CustomPrediction) => cp.isGlobal);
          setPredictions(globals);
          const sel: Record<string, string> = {};
          globals.forEach((cp: CustomPrediction) => { if (cp.userAnswer) sel[cp.id] = cp.userAnswer; });
          setSelected(sel);
        }
      });
  }, [groupId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(withdrawTimerRef.current).forEach(clearTimeout);
      Object.values(withdrawTickRef.current).forEach(clearInterval);
    };
  }, []);

  // Swipe support — see comment in MatchCarousel.tsx for the rationale.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD = 50;
  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
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
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0 && current > 0) setCurrent((c) => c - 1);
    else if (dx < 0 && current < predictions.length - 1) setCurrent((c) => c + 1);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.matches("input, textarea, select")) return;
    if (e.key === "ArrowLeft" && current > 0) {
      e.preventDefault();
      setCurrent((c) => c - 1);
    } else if (e.key === "ArrowRight" && current < predictions.length - 1) {
      e.preventDefault();
      setCurrent((c) => c + 1);
    }
  }

  const handleSubmit = useCallback(async (cpId: string) => {
    const option = selected[cpId];
    if (!option?.trim()) return;
    setSaving((p) => ({ ...p, [cpId]: true }));
    try {
      const res = await fetch(`/api/custom-predictions/${cpId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option: option.trim(), groupId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      setSaved((p) => ({ ...p, [cpId]: true }));
      setPredictions((prev) => prev.map((cp) => cp.id === cpId ? { ...cp, userAnswer: option.trim() } : cp));
      setTimeout(() => setSaved((p) => ({ ...p, [cpId]: false })), 2000);
    } catch (err: unknown) {
      // Surface error briefly so user knows save failed
      setSaved((p) => ({ ...p, [cpId]: false }));
      // Re-use the "saved" label area to show error for 3s via a separate error state
      const msg = (err as Error).message ?? "Failed to save";
      setSaveError((p) => ({ ...p, [cpId]: msg }));
      setTimeout(() => setSaveError((p) => ({ ...p, [cpId]: "" })), 3000);
    } finally {
      setSaving((p) => ({ ...p, [cpId]: false }));
    }
  }, [selected, groupId]);

  const handleWithdraw = useCallback((cpId: string) => {
    // Optimistically clear & start 5s countdown
    setWithdrawPending((p) => ({ ...p, [cpId]: true }));
    setWithdrawCountdown((p) => ({ ...p, [cpId]: 5 }));

    withdrawTickRef.current[cpId] = setInterval(() => {
      setWithdrawCountdown((p) => ({ ...p, [cpId]: Math.max(0, (p[cpId] ?? 1) - 1) }));
    }, 1000);

    withdrawTimerRef.current[cpId] = setTimeout(async () => {
      clearInterval(withdrawTickRef.current[cpId]);
      setWithdrawPending((p) => ({ ...p, [cpId]: false }));
      await fetch(`/api/custom-predictions/${cpId}/answer?groupId=${groupId}`, { method: "DELETE" });
      setSelected((p) => { const n = { ...p }; delete n[cpId]; return n; });
      setPredictions((prev) => prev.map((cp) => cp.id === cpId ? { ...cp, userAnswer: null } : cp));
    }, 5000);
  }, [groupId]);

  const handleUndoWithdraw = useCallback((cpId: string) => {
    clearTimeout(withdrawTimerRef.current[cpId]);
    clearInterval(withdrawTickRef.current[cpId]);
    setWithdrawPending((p) => ({ ...p, [cpId]: false }));
  }, []);

  if (predictions.length === 0) return null;

  const total = predictions.length;
  const cp = predictions[current];

  const isPlayer = cp.optionType === "PLAYER";
  const isTeam = cp.optionType === "TEAM";
  const isFixed = !isPlayer && !isTeam;

  const allAnswers = cp.answers ?? [];
  const correctValues = cp.correctOption
    ? cp.correctOption.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
    : [];
  const freeAnswerCounts = (isPlayer || isTeam) && (cp.isLocked || cp.status === "RESOLVED")
    ? allAnswers.reduce<Record<string, number>>((acc, a) => {
        const key = a.option.trim().toLowerCase();
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    : {};
  const uniqueFreeAnswers = Object.keys(freeAnswerCounts).sort((a, b) => freeAnswerCounts[b] - freeAnswerCounts[a]);

  const hasPred = !!cp.userAnswer;
  const isPending = !!withdrawPending[cp.id];

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="prediction carousel"
      aria-label={`Prediction ${current + 1} of ${predictions.length}`}
      className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-fifa-blue focus-visible:ring-offset-2"
    >
      <div className="card flex flex-col gap-3 relative">
        {/* Predicted badge */}
        {hasPred && !isPending && cp.status === "OPEN" && !cp.isLocked && (
          <div className="absolute top-3 right-3">
            <span className="badge bg-green-100 text-green-700">✓ Predicted</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-800 text-sm leading-snug flex-1 min-w-0">{cp.question}</p>
          <span className={`badge shrink-0 whitespace-nowrap ${
            cp.status === "RESOLVED" ? "bg-green-100 text-green-700" :
            cp.isLocked ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
          }`}>
            {cp.status === "RESOLVED" ? `✓ ${cp.points}pts` : cp.isLocked ? "🔒 Locked" : `${cp.points}pts`}
          </span>
        </div>

        {cp.description && (
          <p className="text-xs text-gray-400 italic">{cp.description}</p>
        )}

        {!cp.isLocked && cp.status === "OPEN" && (
          <p className="text-xs text-gray-400"><Countdown lockTime={cp.lockTime} /></p>
        )}

        {/* ── OPEN + not locked: input area ── */}
        {cp.status === "OPEN" && !cp.isLocked && !isPending && (
          <>
            <div>
              {isFixed && (
                <div className="space-y-1.5">
                  {cp.options.map((opt) => {
                    const flag = getFlag(opt);
                    const isSelected = selected[cp.id] === opt;
                    return (
                      <label
                        key={opt}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition text-sm ${
                          isSelected
                            ? "border-fifa-blue bg-blue-50 text-fifa-blue font-medium"
                            : "border-gray-200 hover:border-gray-300 text-gray-700"
                        }`}
                      >
                        <input type="radio" name={cp.id} value={opt} checked={isSelected}
                          onChange={() => setSelected((p) => ({ ...p, [cp.id]: opt }))} className="sr-only" />
                        <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isSelected ? "border-fifa-blue bg-fifa-blue" : "border-gray-300"}`} />
                        {flag && <span className="shrink-0">{flag}</span>}
                        {opt}
                      </label>
                    );
                  })}
                </div>
              )}
              {isTeam && (
                <TeamPicker
                  value={selected[cp.id] ?? ""}
                  onChange={(v) => setSelected((p) => ({ ...p, [cp.id]: v }))}
                />
              )}
              {isPlayer && (
                <PlayerPicker
                  value={selected[cp.id] ?? ""}
                  onChange={(v) => setSelected((p) => ({ ...p, [cp.id]: v }))}
                />
              )}
            </div>
            <div className="border-t border-gray-100 pt-2 flex flex-col gap-1">
              <div className="flex items-center gap-2">
              <button
                onClick={() => handleSubmit(cp.id)}
                disabled={saving[cp.id] || !selected[cp.id]?.trim()}
                className="btn-primary text-xs px-3 py-1.5 flex-1 disabled:opacity-40"
              >
                {saving[cp.id] ? "..." : saved[cp.id] ? "Saved ✓" : cp.userAnswer ? "Update" : "Save"}
              </button>
              {hasPred && (
                <button
                  onClick={() => handleWithdraw(cp.id)}
                  title="Withdraw answer"
                  className="w-11 h-11 flex items-center justify-center rounded-full border border-red-200 text-red-400 hover:bg-red-50 hover:border-red-400 hover:text-red-600 transition shrink-0"
                >
                  ✕
                </button>
              )}
              </div>
              {saveError[cp.id] && (
                <p className="text-xs text-red-500">{saveError[cp.id]}</p>
              )}
            </div>
          </>
        )}

        {/* ── Undo withdraw toast ── */}
        {isPending && cp.status === "OPEN" && !cp.isLocked && (
          <div className="border border-orange-100 bg-orange-50 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-orange-600 flex-1">
              Answer withdrawn ({withdrawCountdown[cp.id] ?? 0}s)
            </span>
            <button
              onClick={() => handleUndoWithdraw(cp.id)}
              className="text-xs font-semibold text-fifa-blue hover:underline"
            >
              Undo
            </button>
          </div>
        )}

        {/* ── LOCKED (not resolved) ── */}
        {cp.status === "OPEN" && cp.isLocked && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              How everyone answered ({cp.totalAnswers} {cp.totalAnswers === 1 ? "response" : "responses"})
            </p>
            {(isPlayer || isTeam) ? (
              uniqueFreeAnswers.slice(0, 6).map((key) => {
                const count = freeAnswerCounts[key];
                const pct = cp.totalAnswers ? Math.round((count / cp.totalAnswers) * 100) : 0;
                const isUserAnswer = key === cp.userAnswer?.trim().toLowerCase();
                return (
                  <div key={key} className={`rounded-lg border px-3 py-2 text-sm ${isUserAnswer ? "border-fifa-blue bg-blue-50" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium ${isUserAnswer ? "text-fifa-blue" : "text-gray-700"}`}>{key}{isUserAnswer ? " ← your pick" : ""}</span>
                      <span className="text-xs text-gray-400">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${isUserAnswer ? "bg-fifa-blue" : "bg-gray-300"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              cp.options.map((opt) => {
                const count = cp.answerCounts?.[opt] ?? 0;
                const pct = cp.totalAnswers ? Math.round((count / cp.totalAnswers) * 100) : 0;
                const isUserAnswer = opt === cp.userAnswer;
                return (
                  <div key={opt} className={`rounded-lg border px-3 py-2 text-sm ${isUserAnswer ? "border-fifa-blue bg-blue-50" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium ${isUserAnswer ? "text-fifa-blue" : "text-gray-700"}`}>{opt}{isUserAnswer ? " ← your pick" : ""}</span>
                      <span className="text-xs text-gray-400">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${isUserAnswer ? "bg-fifa-blue" : "bg-gray-300"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
            <div className="border-t border-gray-100 pt-2 text-xs text-orange-500 font-medium">
              {hasPred ? "Locked" : "Locked — no prediction submitted"}
            </div>
          </div>
        )}

        {/* ── RESOLVED ── */}
        {cp.status === "RESOLVED" && (
          <div className="space-y-2">
            {(isPlayer || isTeam) ? (
              <>
                <div className="rounded-lg border border-green-400 bg-green-50 px-3 py-2 text-sm">
                  <p className="text-green-700 font-medium">
                    ✓ Correct answer{correctValues.length > 1 ? "s" : ""}: {correctValues.join(", ")}
                  </p>
                </div>
                {uniqueFreeAnswers.slice(0, 6).map((key) => {
                  const count = freeAnswerCounts[key];
                  const pct = cp.totalAnswers ? Math.round((count / cp.totalAnswers) * 100) : 0;
                  const isCorrect = correctValues.includes(key);
                  return (
                    <div key={key} className={`rounded-lg border px-3 py-2 text-sm ${isCorrect ? "border-green-400 bg-green-50" : "border-gray-200"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-medium ${isCorrect ? "text-green-700" : "text-gray-700"}`}>{isCorrect ? "✓ " : ""}{key}</span>
                        <span className="text-xs text-gray-400">{count} picks</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${isCorrect ? "bg-green-400" : "bg-gray-300"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              cp.options.map((opt) => {
                const isCorrect = correctValues.includes(opt.trim().toLowerCase());
                const isUserAnswer = opt === cp.userAnswer;
                const count = cp.answerCounts?.[opt] ?? 0;
                const pct = cp.totalAnswers ? Math.round((count / cp.totalAnswers) * 100) : 0;
                return (
                  <div key={opt} className={`rounded-lg border px-3 py-2 text-sm ${isCorrect ? "border-green-400 bg-green-50" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium ${isCorrect ? "text-green-700" : "text-gray-700"}`}>
                        {isCorrect && "✓ "}{opt}
                        {isUserAnswer && !isCorrect && " ← your pick"}
                        {isUserAnswer && isCorrect && " ← your pick 🎉"}
                      </span>
                      <span className="text-xs text-gray-400">{count} {count === 1 ? "pick" : "picks"}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${isCorrect ? "bg-green-400" : "bg-gray-300"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
            <p className={`text-xs text-center font-semibold ${cp.userPoints ? "text-green-600" : "text-gray-400"}`}>
              {cp.userAnswer
                ? cp.userPoints ? `+${cp.userPoints} pts earned!` : "No points this time"
                : "You didn't answer this one"}
            </p>
          </div>
        )}
      </div>

      {/* Carousel controls */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="w-11 h-11 shrink-0 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-30"
        >
          ‹
        </button>

        <div className="flex gap-1 items-center justify-center flex-1 flex-wrap overflow-hidden">
          {predictions.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setCurrent(i)}
              className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100 transition shrink-0"
              aria-label={`Prediction ${i + 1}`}
              title={p.question}
            >
              <span className={`rounded-full transition-all block ${
                i === current
                  ? "bg-fifa-blue w-4 h-2"
                  : p.userAnswer
                  ? "bg-green-400 w-2 h-2"
                  : "bg-gray-200 w-2 h-2"
              }`} />
            </button>
          ))}
        </div>

        <button
          onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
          disabled={current === total - 1}
          className="w-11 h-11 shrink-0 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <p className="text-center text-xs text-gray-400 mt-1">{current + 1} of {total}</p>
    </div>
  );
}
