"use client";

import { useState } from "react";
import { isPredictionLocked } from "@/lib/scoring";
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

interface Props {
  match: Match;
  prediction?: Prediction;
  onSave?: (matchId: string, home: number, away: number) => Promise<void>;
  isLoggedIn: boolean;
}

const UNUSUAL_THRESHOLD = 7;

function unrealisticWarning(h: number, a: number): string | null {
  if (h > 20 || a > 20) return "Score over 20 — looks like a typo.";
  if (h >= UNUSUAL_THRESHOLD || a >= UNUSUAL_THRESHOLD)
    return "Unusually high score for international football — double-check before saving.";
  return null;
}

export function MatchCard({ match, prediction, onSave, isLoggedIn }: Props) {
  const [homeInput, setHomeInput] = useState<string>(
    prediction !== undefined ? String(prediction.homeScore) : ""
  );
  const [awayInput, setAwayInput] = useState<string>(
    prediction !== undefined ? String(prediction.awayScore) : ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const kickoff = new Date(match.kickoff);
  const locked = isPredictionLocked(kickoff);
  const finished = match.status === "FINISHED";

  // Treat empty input as 0; still reject non-numeric input
  const parseScore = (val: string) => (val.trim() === "" ? 0 : parseInt(val, 10));

  const h = parseScore(homeInput);
  const a = parseScore(awayInput);
  const inputsValid = !isNaN(h) && !isNaN(a) && h >= 0 && a >= 0;
  const warning = inputsValid ? unrealisticWarning(h, a) : null;

  const handleSave = async () => {
    if (!inputsValid) {
      setError("Enter valid scores (0 or more)");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave!(match.id, h, a);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const pointsBadge = () => {
    if (!finished || prediction?.points === undefined || prediction.points === null) return null;
    const pts = prediction.points;
    const color = pts >= 5 ? "bg-green-100 text-green-800" : pts > 0 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-500";
    return <span className={`badge ${color} ml-2`}>{pts > 0 ? `+${pts}` : "0"} pts</span>;
  };

  const hasPred = prediction !== undefined;

  const resultBg = (() => {
    if (!finished || !hasPred || prediction.points === null) return "";
    const isExact = match.homeScore === prediction.homeScore && match.awayScore === prediction.awayScore;
    if (isExact) return "!bg-emerald-50 !border-emerald-400";
    if (prediction.points > 0) return "!bg-green-50 !border-green-200";
    return "!bg-red-50 !border-red-200";
  })();

  return (
    <div className={`card flex flex-col gap-3 relative ${resultBg}`}>
      {/* Predicted badge — shown when prediction exists and match not yet locked or finished */}
      {hasPred && !locked && !finished && (
        <div className="absolute top-3 right-3">
          <span className="badge bg-green-100 text-green-700">✓ Predicted</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {match.group ? `Group ${match.group}` : match.round} · #{match.matchNumber}
        </span>
        <span className="truncate max-w-[140px] text-right">{match.city}</span>
      </div>

      {/* Teams & Score */}
      <div className="flex items-start justify-between gap-2">
        {/* Home */}
        <div className="flex-1 text-right">
          <p className="font-semibold text-gray-800 text-sm leading-snug">{match.homeTeam}</p>
          <p className="text-base leading-tight">{getFlag(match.homeTeam) || "　"}</p>
        </div>
        {/* Score / date */}
        <div className="shrink-0 text-center pt-0.5">
          {finished ? (
            <span className="text-lg font-bold text-fifa-blue whitespace-nowrap">
              {match.homeScore} – {match.awayScore}
            </span>
          ) : (
            <span className="text-xs text-gray-400 font-medium">
              {kickoff.toLocaleDateString("en-US", {
                month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit", timeZoneName: "short",
              })}
            </span>
          )}
        </div>
        {/* Away */}
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm leading-snug">{match.awayTeam}</p>
          <p className="text-base leading-tight">{getFlag(match.awayTeam) || "　"}</p>
        </div>
      </div>

      {/* Prediction row */}
      {isLoggedIn && (
        <div className="border-t border-gray-100 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400">Your prediction:</span>
            {pointsBadge()}
          </div>
          {finished && prediction ? (
            <div className="text-sm text-gray-600 mt-1">
              {prediction.homeScore} – {prediction.awayScore}
            </div>
          ) : finished && !prediction ? (
            <div className="text-xs text-gray-400 italic mt-1">No prediction submitted</div>
          ) : locked ? (
            <div className="text-xs text-orange-500 font-medium mt-1">
              {prediction ? `${prediction.homeScore} – ${prediction.awayScore} (locked)` : "Locked — no prediction submitted"}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={homeInput}
                  onChange={(e) => setHomeInput(e.target.value)}
                  className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                  placeholder="0"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={awayInput}
                  onChange={(e) => setAwayInput(e.target.value)}
                  className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                  placeholder="0"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !onSave}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  {saving ? "..." : saved ? "Saved ✓" : "Save"}
                </button>
              </div>
              {warning && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span>⚠️</span> {warning}
                </p>
              )}
            </div>
          )}
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
