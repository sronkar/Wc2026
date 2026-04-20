"use client";

import { useEffect, useState } from "react";
import { WC2026_TEAMS } from "@/lib/teams";

interface CustomPrediction {
  id: string;
  question: string;
  optionType: string;
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

function TeamPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const filtered = query.trim()
    ? WC2026_TEAMS.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
    : WC2026_TEAMS;

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); if (!e.target.value) onChange(""); }}
        placeholder="Search team…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
      />
      {query.trim() && (
        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No teams match</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t}
                onClick={() => { setQuery(t); onChange(t); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition ${value === t ? "font-semibold text-fifa-blue bg-blue-50" : "text-gray-700"}`}
              >
                {value === t ? "✓ " : ""}{t}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PlayerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter player name…"
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
    />
  );
}

export function CustomPredictionsPanel({ groupId }: { groupId: string }) {
  const [predictions, setPredictions] = useState<CustomPrediction[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

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

  const handleSubmit = async (cpId: string) => {
    const option = selected[cpId];
    if (!option?.trim()) return;
    setSaving((p) => ({ ...p, [cpId]: true }));
    await fetch(`/api/custom-predictions/${cpId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ option: option.trim() }),
    });
    setSaving((p) => ({ ...p, [cpId]: false }));
    setSaved((p) => ({ ...p, [cpId]: true }));
    setPredictions((prev) => prev.map((cp) => cp.id === cpId ? { ...cp, userAnswer: option.trim() } : cp));
    setTimeout(() => setSaved((p) => ({ ...p, [cpId]: false })), 2000);
  };

  const visible = predictions.filter(
    (cp) =>
      cp.status === "OPEN" ||
      (cp.status === "RESOLVED" && new Date(cp.lockTime).getTime() > Date.now() - 7 * 86_400_000)
  );

  if (visible.length === 0) return null;

  return (
    <div>
      <h2 className="font-bold text-gray-800 mb-3">Custom Predictions</h2>
      <div className="space-y-4">
        {visible.map((cp) => {
          const isPlayer = cp.optionType === "PLAYER";
          const isTeam = cp.optionType === "TEAM";
          const isFixed = !isPlayer && !isTeam;

          // For resolved/locked views: aggregate all submitted answers for PLAYER type
          const allAnswers = cp.answers ?? [];
          const playerAnswerCounts = isPlayer && cp.isLocked
            ? allAnswers.reduce<Record<string, number>>((acc, a) => {
                const key = a.option.trim().toLowerCase();
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
              }, {})
            : {};
          const uniquePlayerAnswers = Object.keys(playerAnswerCounts).sort((a, b) => playerAnswerCounts[b] - playerAnswerCounts[a]);

          return (
            <div key={cp.id} className="card">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="font-semibold text-gray-800 text-sm leading-snug">{cp.question}</p>
                <span className={`badge shrink-0 ${
                  cp.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                  cp.isLocked ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {cp.status === "RESOLVED" ? `✓ ${cp.points}pts` : cp.isLocked ? "🔒 Locked" : `${cp.points}pts`}
                </span>
              </div>

              {!cp.isLocked && cp.status === "OPEN" && (
                <p className="text-xs text-gray-400 mb-3"><Countdown lockTime={cp.lockTime} /></p>
              )}

              {/* ── OPEN + not locked: input area ── */}
              {cp.status === "OPEN" && !cp.isLocked && (
                <>
                  <div className="mb-3">
                    {isFixed && (
                      <div className="space-y-2">
                        {cp.options.map((opt) => (
                          <label
                            key={opt}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition text-sm ${
                              selected[cp.id] === opt
                                ? "border-fifa-blue bg-blue-50 text-fifa-blue font-medium"
                                : "border-gray-200 hover:border-gray-300 text-gray-700"
                            }`}
                          >
                            <input type="radio" name={cp.id} value={opt} checked={selected[cp.id] === opt}
                              onChange={() => setSelected((p) => ({ ...p, [cp.id]: opt }))} className="sr-only" />
                            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${selected[cp.id] === opt ? "border-fifa-blue bg-fifa-blue" : "border-gray-300"}`} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                    {isTeam && (
                      <TeamPicker
                        value={selected[cp.id] ?? ""}
                        onChange={(v) => setSelected((p) => ({ ...p, [cp.id]: v }))}
                      />
                    )}
                    {isPlayer && (
                      <PlayerInput
                        value={selected[cp.id] ?? ""}
                        onChange={(v) => setSelected((p) => ({ ...p, [cp.id]: v }))}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => handleSubmit(cp.id)}
                    disabled={saving[cp.id] || !selected[cp.id]?.trim()}
                    className="btn-primary text-xs w-full disabled:opacity-40"
                  >
                    {saving[cp.id] ? "Saving…" : saved[cp.id] ? "Saved ✓" : cp.userAnswer ? "Update Answer" : "Submit Answer"}
                  </button>
                </>
              )}

              {/* ── RESOLVED ── */}
              {cp.status === "RESOLVED" && (
                <div className="space-y-2">
                  {isPlayer ? (
                    <>
                      <div className="rounded-lg border border-green-400 bg-green-50 px-3 py-2 text-sm">
                        <p className="text-green-700 font-medium">✓ Correct answer: {cp.correctOption}</p>
                      </div>
                      {cp.userAnswer && (
                        <p className={`text-xs text-center font-semibold ${cp.userPoints ? "text-green-600" : "text-gray-400"}`}>
                          Your pick: {cp.userAnswer} — {cp.userPoints ? `+${cp.userPoints} pts!` : "no points this time"}
                        </p>
                      )}
                      {uniquePlayerAnswers.slice(0, 10).map((key) => {
                        const count = playerAnswerCounts[key];
                        const pct = cp.totalAnswers ? Math.round((count / cp.totalAnswers) * 100) : 0;
                        const isCorrect = key === cp.correctOption?.trim().toLowerCase();
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
                      const isCorrect = opt === cp.correctOption;
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
                  {!isPlayer && cp.userAnswer && (
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
                  {isPlayer ? (
                    uniquePlayerAnswers.slice(0, 10).map((key) => {
                      const count = playerAnswerCounts[key];
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
