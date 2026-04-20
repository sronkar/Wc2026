"use client";

import { useState, useCallback } from "react";
import { isPredictionLocked } from "@/lib/scoring";
import { getFlag } from "@/lib/flags";

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

interface Props {
  groupId: string;
  matches: CarouselMatch[];
  predictions: Record<string, CarouselPrediction>;
}

export function MatchCarousel({ groupId, matches, predictions: initialPredictions }: Props) {
  const [current, setCurrent] = useState(0);
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

  const total = matches.length;

  const parseScore = (val: string) => (val.trim() === "" ? 0 : parseInt(val, 10));

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
  const locked = isPredictionLocked(kickoff);
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
    <div>
      {/* Card */}
      <div className="card relative overflow-hidden">
        {/* Match header */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
          <span className="font-medium">
            {match.group ? `Group ${match.group}` : match.round}
          </span>
          <span>{match.city}</span>
        </div>

        {/* Teams */}
        <div className="flex items-start justify-center gap-4 mb-3">
          <div className="flex-1 text-right">
            <p className="text-base font-extrabold text-gray-800 leading-snug">{match.homeTeam}</p>
            <p className="text-xl leading-tight">{getFlag(match.homeTeam) || "　"}</p>
          </div>
          <span className="text-gray-300 font-light text-xl shrink-0 mt-0.5">vs</span>
          <div className="flex-1">
            <p className="text-base font-extrabold text-gray-800 leading-snug">{match.awayTeam}</p>
            <p className="text-xl leading-tight">{getFlag(match.awayTeam) || "　"}</p>
          </div>
        </div>

        {/* Kickoff */}
        <div className="text-center text-xs text-gray-400 mb-4">
          {kickoff.toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit", timeZoneName: "short",
          })}
        </div>

        {/* Prediction area */}
        {locked ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="text-orange-500 text-sm font-semibold">🔒 Locked</span>
            {hasPred && (
              <span className="text-gray-500 text-sm">
                Your pick: {preds[match.id].homeScore}–{preds[match.id].awayScore}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={inp.home}
                onChange={(e) => setInputs((i) => ({ ...i, [match.id]: { ...i[match.id], home: e.target.value } }))}
                className="w-14 border-2 border-gray-200 rounded-lg px-2 py-2 text-center text-lg font-bold focus:outline-none focus:border-fifa-blue"
                placeholder="0"
              />
              <span className="text-gray-300 text-2xl font-thin">–</span>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={inp.away}
                onChange={(e) => setInputs((i) => ({ ...i, [match.id]: { ...i[match.id], away: e.target.value } }))}
                className="w-14 border-2 border-gray-200 rounded-lg px-2 py-2 text-center text-lg font-bold focus:outline-none focus:border-fifa-blue"
                placeholder="0"
              />
            </div>
            <button
              onClick={() => handleSave(match.id)}
              disabled={saving[match.id]}
              className="btn-primary px-8 py-2 text-sm"
            >
              {saving[match.id] ? "Saving…" : saved[match.id] ? "Saved ✓" : hasPred ? "Update" : "Save Prediction"}
            </button>
            {carouselWarning && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <span>⚠️</span> {carouselWarning}
              </p>
            )}
            {errors[match.id] && <p className="text-xs text-red-500">{errors[match.id]}</p>}
          </div>
        )}

        {/* Status badge */}
        {hasPred && !locked && (
          <div className="absolute top-3 right-3">
            <span className="badge bg-green-100 text-green-700">✓ Predicted</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-30"
        >
          ‹
        </button>

        {/* Dot indicators */}
        <div className="flex gap-1.5">
          {matches.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === current
                  ? "bg-fifa-blue w-5"
                  : preds[m.id]
                  ? "bg-green-400"
                  : "bg-gray-200"
              }`}
              aria-label={`Match ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
          disabled={current === total - 1}
          className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <p className="text-center text-xs text-gray-400 mt-1">{current + 1} of {total}</p>
    </div>
  );
}
