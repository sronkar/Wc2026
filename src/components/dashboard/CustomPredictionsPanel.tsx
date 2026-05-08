"use client";

import { useEffect, useState } from "react";
import { WC2026_TEAMS } from "@/lib/teams";
import { WC_GROUPS, TEAMS_BY_GAME_ORDER } from "@/lib/wcGroups";
import { getFlag } from "@/lib/flags";

interface CustomPrediction {
  id: string;
  question: string;
  description: string | null;
  optionType: string;
  teamSort: string;
  options: string[];
  points: number;
  lockTime: string;
  isLocked: boolean;
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

function TeamPicker({ value, onChange, sort = "ALPHABETICAL" }: { value: string; onChange: (v: string) => void; sort?: string }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => { setQuery(value); setOpen(false); }, [value]);

  const isValidTeam = value ? WC2026_TEAMS.includes(value) : false;
  const q = query.trim().toLowerCase();
  const baseList = sort === "BY_GAME_ORDER" ? TEAMS_BY_GAME_ORDER : [...WC2026_TEAMS].sort((a, b) => a.localeCompare(b));
  const filtered = q ? baseList.filter((t) => t.toLowerCase().includes(q)) : [];

  const renderTeamButton = (t: string) => (
    <button
      key={t}
      onClick={() => { setQuery(t); onChange(t); setOpen(false); }}
      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition flex items-center gap-2 border-b border-gray-100 last:border-0 ${value === t ? "font-semibold text-fifa-blue bg-blue-50" : "text-gray-700"}`}
    >
      <span className="shrink-0">{getFlag(t) || "🏳️"}</span>
      {value === t ? "✓ " : ""}{t}
    </button>
  );

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

  const placeholder =
    sort === "BY_GROUP" ? "Search or browse by group…" :
    sort === "BY_GAME_ORDER" ? "Search or browse by game order…" :
    "Search team…";

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoFocus={open}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
      />
      {open && (
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
          {q ? (
            filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No teams match</p>
            ) : (
              <div className="divide-y divide-gray-100">{filtered.map(renderTeamButton)}</div>
            )
          ) : sort === "BY_GROUP" ? (
            Object.entries(WC_GROUPS).map(([group, teams]) => (
              <div key={group}>
                <div className="px-3 py-1 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  Group {group}
                </div>
                {teams.map(renderTeamButton)}
              </div>
            ))
          ) : (
            <div className="divide-y divide-gray-100">{baseList.map(renderTeamButton)}</div>
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

function PlayerPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/players?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => { setResults(Array.isArray(data) ? data : []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); if (!e.target.value) onChange(""); }}
        placeholder="Search by player name or country…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
      />
      {query.trim() && (
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {loading ? (
            <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No players found</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                onClick={() => { setQuery(p.name); onChange(p.name); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${
                  value === p.name ? "font-semibold text-fifa-blue bg-blue-50" : "text-gray-700"
                }`}
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

export function CustomPredictionsPanel({ groupId, hideResolved = false }: { groupId: string; hideResolved?: boolean }) {
  const [predictions, setPredictions] = useState<CustomPrediction[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({});
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  useEffect(() => {
    fetch(`/api/custom-predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPredictions(data);
          const sel: Record<string, string> = {};
          data.forEach((cp: CustomPrediction) => {
            if (cp.userAnswer) sel[cp.id] = cp.userAnswer;
          });
          setSelected(sel);
        }
      });
  }, [groupId]);

  const handleCancel = async (cpId: string) => {
    setCancelling((p) => ({ ...p, [cpId]: true }));
    await fetch(`/api/custom-predictions/${cpId}/answer?groupId=${groupId}`, { method: "DELETE" });
    setCancelling((p) => ({ ...p, [cpId]: false }));
    setSelected((p) => { const n = { ...p }; delete n[cpId]; return n; });
    setPredictions((prev) => prev.map((cp) => cp.id === cpId ? { ...cp, userAnswer: null } : cp));
  };

  const handleSubmit = async (cpId: string) => {
    const option = selected[cpId];
    if (!option?.trim()) return;
    setSaving((p) => ({ ...p, [cpId]: true }));
    await fetch(`/api/custom-predictions/${cpId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ option: option.trim(), groupId }),
    });
    setSaving((p) => ({ ...p, [cpId]: false }));
    setSaved((p) => ({ ...p, [cpId]: true }));
    setPredictions((prev) => prev.map((cp) => cp.id === cpId ? { ...cp, userAnswer: option.trim() } : cp));
    setTimeout(() => setSaved((p) => ({ ...p, [cpId]: false })), 2000);
  };

  const allVisible = predictions.filter((cp) => {
    if (hideResolved && cp.status === "RESOLVED") return false;
    return (
      cp.status === "OPEN" ||
      (cp.status === "RESOLVED" && new Date(cp.lockTime).getTime() > Date.now() - 7 * 86_400_000)
    );
  });

  const openCount = allVisible.filter((cp) => cp.status === "OPEN" && !cp.isLocked && !cp.userAnswer).length;
  const visible = showOpenOnly
    ? allVisible.filter((cp) => cp.status === "OPEN" && !cp.isLocked && !cp.userAnswer)
    : allVisible;

  if (allVisible.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-800">Custom Predictions</h2>
        <button
          onClick={() => setShowOpenOnly((v) => !v)}
          className={`text-xs px-2.5 py-1 rounded-full border transition ${
            showOpenOnly
              ? "bg-fifa-blue text-white border-fifa-blue"
              : "border-gray-300 text-gray-500 hover:border-fifa-blue hover:text-fifa-blue"
          }`}
        >
          {showOpenOnly ? "Open only" : openCount > 0 ? `Open only (${openCount})` : "Open only"}
        </button>
      </div>
      {showOpenOnly && visible.length === 0 && (
        <div className="card text-center py-6">
          <p className="text-2xl mb-1">🎉</p>
          <p className="text-sm font-semibold text-gray-700">All caught up!</p>
          <p className="text-xs text-gray-400 mt-0.5">You&apos;ve answered all open predictions.</p>
          <button onClick={() => setShowOpenOnly(false)} className="mt-3 text-xs text-fifa-blue hover:underline">
            Show all predictions
          </button>
        </div>
      )}
      <div className="space-y-4">
        {visible.map((cp) => {
          const isPlayer = cp.optionType === "PLAYER";
          const isTeam = cp.optionType === "TEAM";
          const isFixed = !isPlayer && !isTeam;

          // For resolved/locked views: aggregate all submitted answers for PLAYER and TEAM types
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
          // keep legacy names for PLAYER branches
          const playerAnswerCounts = freeAnswerCounts;
          const uniquePlayerAnswers = uniqueFreeAnswers;

          return (
            <div key={cp.id} className="card">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="font-semibold text-gray-800 text-sm leading-snug">{cp.question}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {cp.userAnswer && cp.status !== "RESOLVED" && (
                    <span className="badge bg-green-100 text-green-700">✓ Answered</span>
                  )}
                  <span className={`badge ${
                    cp.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                    cp.isLocked ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {cp.status === "RESOLVED" ? `✓ ${cp.points}pts` : cp.isLocked ? "🔒 Locked" : `${cp.points}pts`}
                  </span>
                </div>
              </div>

              {cp.description && (
                <p className="text-xs text-gray-400 italic mb-2">{cp.description}</p>
              )}

              {!cp.isLocked && cp.status === "OPEN" && (
                <p className="text-xs text-gray-400 mb-3"><Countdown lockTime={cp.lockTime} /></p>
              )}

              {/* ── OPEN + not locked: input area ── */}
              {cp.status === "OPEN" && !cp.isLocked && (
                <>
                  <div className="mb-3">
                    {isFixed && (
                      <div className="space-y-2">
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
                        key={cp.id}
                        value={selected[cp.id] ?? ""}
                        onChange={(v) => setSelected((p) => ({ ...p, [cp.id]: v }))}
                        sort={cp.teamSort}
                      />
                    )}
                    {isPlayer && (
                      <PlayerPicker
                        value={selected[cp.id] ?? ""}
                        onChange={(v) => setSelected((p) => ({ ...p, [cp.id]: v }))}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSubmit(cp.id)}
                      disabled={saving[cp.id] || !selected[cp.id]?.trim()}
                      className="btn-primary text-xs flex-1 disabled:opacity-40"
                    >
                      {saving[cp.id] ? "Saving…" : saved[cp.id] ? "Saved ✓" : cp.userAnswer ? "Update Answer" : "Submit Answer"}
                    </button>
                    {cp.userAnswer && (
                      <button
                        onClick={() => handleCancel(cp.id)}
                        disabled={cancelling[cp.id]}
                        className="text-xs text-gray-400 hover:text-red-500 transition disabled:opacity-40 px-1"
                        title="Withdraw answer"
                      >
                        {cancelling[cp.id] ? "…" : "×"}
                      </button>
                    )}
                  </div>
                </>
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
                      {cp.userAnswer && (
                        <p className={`text-xs text-center font-semibold ${cp.userPoints ? "text-green-600" : "text-gray-400"}`}>
                          Your pick: {cp.userAnswer} — {cp.userPoints ? `+${cp.userPoints} pts!` : "no points this time"}
                        </p>
                      )}
                      {uniqueFreeAnswers.slice(0, 10).map((key) => {
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
                  {cp.userAnswer && (
                    <p className={`text-xs text-center mt-2 font-semibold ${cp.userPoints ? "text-green-600" : "text-gray-400"}`}>
                      {cp.userPoints ? `+${cp.userPoints} pts earned!` : "No points this time"}
                    </p>
                  )}
                  {!cp.userAnswer && (
                    <p className="text-xs text-center mt-2 text-gray-400">You didn&apos;t answer this one</p>
                  )}
                </div>
              )}

              {/* ── LOCKED, not resolved: distribution ── */}
              {cp.status === "OPEN" && cp.isLocked && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-2">How everyone answered ({cp.totalAnswers} {cp.totalAnswers === 1 ? "response" : "responses"})</p>
                  {(isPlayer || isTeam) ? (
                    uniqueFreeAnswers.slice(0, 10).map((key) => {
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}