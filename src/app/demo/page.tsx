"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface DemoPrediction {
  userId: string;
  userName: string | null;
  homeScore: number;
  awayScore: number;
  points: number | null;
}

interface DemoMatch {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  relativeLabel: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  isLocked: boolean;
  predictions: DemoPrediction[];
}

interface DemoUser {
  id: string;
  name: string | null;
  email: string | null;
  predictions: { matchId: string; homeScore: number; awayScore: number; points: number | null }[];
}

interface DemoState {
  virtualTime: string;
  realTime: string;
  demoMatches: DemoMatch[];
  demoUsers: DemoUser[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZoneName: "short",
  });
}

function offsetLabel(virtualIso: string, realIso: string) {
  const diff = Math.round((new Date(virtualIso).getTime() - new Date(realIso).getTime()) / 60_000);
  if (diff === 0) return "in sync with real time";
  const abs = Math.abs(diff);
  const label = abs < 60 ? `${abs}m` : `${Math.floor(abs / 60)}h${abs % 60 ? `${abs % 60}m` : ""}`;
  return diff > 0 ? `${label} ahead of real time` : `${label} behind real time`;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function DemoPage() {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<{ ts: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Match form
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoffOffset, setKickoffOffset] = useState("120");
  const [matchRound, setMatchRound] = useState("Demo");

  // User form
  const [userCount, setUserCount] = useState("5");

  // Score inputs per match
  const [scoreInputs, setScoreInputs] = useState<Record<string, { home: string; away: string }>>({});

  // Simulate inputs
  const [simMatchId, setSimMatchId] = useState("");
  const [simHome, setSimHome] = useState("1");
  const [simAway, setSimAway] = useState("0");

  // Custom time jump
  const [customTimeIso, setCustomTimeIso] = useState("");

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadState = useCallback(async () => {
    const res = await fetch("/api/demo");
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Demo mode is not enabled. Set DEMO_MODE=true in your .env and restart.");
      return;
    }
    const data: DemoState = await res.json();
    setState(data);
    setError(null);

    // Initialise score inputs for any new matches
    setScoreInputs((prev) => {
      const next = { ...prev };
      data.demoMatches.forEach((m) => {
        if (!next[m.id]) {
          next[m.id] = {
            home: m.homeScore != null ? String(m.homeScore) : "",
            away: m.awayScore != null ? String(m.awayScore) : "",
          };
        }
      });
      return next;
    });

    // Default simulate match to first unfinished demo match
    if (!simMatchId && data.demoMatches.length > 0) {
      const unfinished = data.demoMatches.find((m) => m.status !== "FINISHED");
      if (unfinished) setSimMatchId(unfinished.id);
    }
  }, [simMatchId]);

  useEffect(() => { loadState(); }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // ── Action helper ───────────────────────────────────────────────────────────

  const act = useCallback(async (body: object): Promise<Record<string, unknown>> => {
    setBusy(true);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const ts = new Date().toLocaleTimeString();

      if (Array.isArray(data.log)) {
        setLog((prev) => [...prev, ...data.log.map((t: string) => ({ ts, text: t }))]);
      } else {
        const msg = data.message ?? data.error ?? (data.ok ? "Done" : "Error");
        setLog((prev) => [...prev, { ts, text: msg }]);
      }

      await loadState();
      return data;
    } finally {
      setBusy(false);
    }
  }, [loadState]);

  // ── Render guard ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-4">🚧</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Demo Mode Not Active</h1>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  if (!state) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading demo environment…</div>;
  }

  const timeDiff = offsetLabel(state.virtualTime, state.realTime);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-900 to-indigo-700 px-6 py-4 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-amber-400 text-black font-bold px-2 py-0.5 rounded-full">DEMO</span>
              <h1 className="font-bold text-lg">Test Environment</h1>
            </div>
            <p className="text-indigo-200 text-xs">
              Virtual time controls all locking, reminders and score polling.
              Real data is unaffected — only <code className="bg-white/10 px-1 rounded">isDemo</code> records are used.
            </p>
          </div>
          <button
            onClick={() => { if (confirm("Reset all demo data and return virtual time to now?")) act({ action: "reset" }); }}
            disabled={busy}
            className="text-xs border border-red-400 text-red-300 hover:bg-red-900/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
          >
            🗑 Reset Demo
          </button>
        </div>
      </div>

      {/* ── Virtual time + controls ────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Virtual time</p>
            <p className="text-lg font-bold text-gray-800 font-mono">{fmtTime(state.virtualTime)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{timeDiff}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Real time</p>
            <p className="text-sm text-gray-500 font-mono">{fmtTime(state.realTime)}</p>
          </div>
        </div>

        {/* Quick advance */}
        <p className="text-xs text-gray-500 font-semibold mb-2">Advance virtual time</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {[5, 30, 60, 120, 360, 1440].map((m) => (
            <button
              key={m}
              onClick={() => act({ action: "advanceTime", minutes: m })}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-40"
            >
              +{m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : "24h"}
            </button>
          ))}
          <button
            onClick={() => act({ action: "setTime", iso: new Date().toISOString() })}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
          >
            ⟳ Sync to real time
          </button>
        </div>

        {/* Jump to specific time */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-gray-500 font-semibold shrink-0">Jump to:</p>
          <input
            type="datetime-local"
            value={customTimeIso}
            onChange={(e) => setCustomTimeIso(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={() => {
              if (!customTimeIso) return;
              act({ action: "setTime", iso: new Date(customTimeIso).toISOString() });
            }}
            disabled={busy || !customTimeIso}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40"
          >
            Go
          </button>
          {/* Per-match time shortcuts */}
          {state.demoMatches.map((m) => (
            <div key={m.id} className="flex items-center gap-1 flex-wrap">
              {[{ label: `${m.homeTeam.split(" ")[0]} T-2h`, offset: -120 }, { label: "T+2h", offset: 120 }].map(({ label, offset }) => (
                <button
                  key={label}
                  onClick={() => act({ action: "setTime", iso: new Date(new Date(m.kickoff).getTime() + offset * 60_000).toISOString() })}
                  disabled={busy}
                  className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Setup grid: matches + users ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Add match */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Add Demo Match</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Home team</label>
                <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Brazil"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Away team</label>
                <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Argentina"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kickoff (min from virtual now)</label>
                <input type="number" value={kickoffOffset} onChange={(e) => setKickoffOffset(e.target.value)} min="1"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Round label</label>
                <input value={matchRound} onChange={(e) => setMatchRound(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <button
              onClick={async () => {
                if (!homeTeam || !awayTeam) return;
                await act({ action: "addMatch", homeTeam, awayTeam, kickoffOffsetMinutes: Number(kickoffOffset), round: matchRound });
                setHomeTeam(""); setAwayTeam("");
              }}
              disabled={busy || !homeTeam || !awayTeam}
              className="w-full btn-primary text-sm disabled:opacity-40"
            >
              + Add Match
            </button>
          </div>
        </div>

        {/* Add users */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Demo Users</h2>
          <div className="flex items-end gap-2 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Number to add</label>
              <input type="number" value={userCount} onChange={(e) => setUserCount(e.target.value)} min="1" max="20"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <button
              onClick={() => act({ action: "addUsers", count: Number(userCount) })}
              disabled={busy}
              className="btn-primary text-sm disabled:opacity-40"
            >
              + Add Users
            </button>
          </div>

          {state.demoUsers.length === 0 ? (
            <p className="text-gray-400 text-xs italic">No demo users yet.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {state.demoUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                  <span className="font-medium text-gray-700">{u.name}</span>
                  <span className="text-gray-400">{u.predictions.length} pred{u.predictions.length !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Match state table ────────────────────────────────────────────────────── */}
      {state.demoMatches.length > 0 && (
        <div>
          <h2 className="font-bold text-gray-800 mb-3">Match State</h2>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200 text-xs">
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">Predictions</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.demoMatches.map((m, i) => {
                  const inp = scoreInputs[m.id] ?? { home: "", away: "" };
                  return (
                    <tr key={m.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{m.homeTeam} vs {m.awayTeam}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(m.kickoff).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${
                          m.status === "FINISHED" ? "bg-green-100 text-green-700" :
                          m.isLocked ? "bg-red-100 text-red-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>
                          {m.status === "FINISHED" ? "✓ Finished" : m.isLocked ? `🔒 ${m.relativeLabel}` : `🔓 ${m.relativeLabel}`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">
                          {m.predictions.length}/{state.demoUsers.length} users
                        </div>
                        {m.predictions.length > 0 && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {m.predictions.map((p) => `${p.userName}: ${p.homeScore}–${p.awayScore}${p.points != null ? ` (${p.points}pt)` : ""}`).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {m.status === "FINISHED" ? (
                          <span className="font-bold text-gray-700">{m.homeScore}–{m.awayScore}</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input type="number" min="0" max="20" value={inp.home}
                              onChange={(e) => setScoreInputs((prev) => ({ ...prev, [m.id]: { ...prev[m.id], home: e.target.value } }))}
                              className="w-10 border border-gray-300 rounded px-1 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder="0" />
                            <span className="text-gray-400 text-xs">–</span>
                            <input type="number" min="0" max="20" value={inp.away}
                              onChange={(e) => setScoreInputs((prev) => ({ ...prev, [m.id]: { ...prev[m.id], away: e.target.value } }))}
                              className="w-10 border border-gray-300 rounded px-1 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder="0" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {m.status !== "FINISHED" && (
                            <button
                              onClick={() => act({ action: "autoPredict", matchId: m.id })}
                              disabled={busy || m.isLocked}
                              title={m.isLocked ? "Predictions locked" : "Generate random predictions for all demo users"}
                              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition disabled:opacity-40"
                            >
                              🎲 Predict
                            </button>
                          )}
                          <button
                            onClick={() => act({ action: "setScore", matchId: m.id, homeScore: Number(inp.home || 0), awayScore: Number(inp.away || 0) })}
                            disabled={busy}
                            className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-40"
                          >
                            {m.status === "FINISHED" ? "✎ Re-score" : "⚽ Set score"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Simulate + event controls ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Full simulation */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-1">Run Full Timeline Simulation</h2>
          <p className="text-xs text-gray-400 mb-4">
            Auto-fills missing predictions, jumps to T-2h and sends reminders, then jumps to T+2h, records the score, calculates points and shows the leaderboard.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Match to simulate</label>
              <select value={simMatchId} onChange={(e) => setSimMatchId(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">— select a demo match —</option>
                {state.demoMatches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.homeTeam} vs {m.awayTeam} ({m.relativeLabel})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Final score</label>
                <div className="flex items-center gap-1">
                  <input type="number" min="0" max="20" value={simHome} onChange={(e) => setSimHome(e.target.value)}
                    className="w-14 border border-gray-300 rounded px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <span className="text-gray-400">–</span>
                  <input type="number" min="0" max="20" value={simAway} onChange={(e) => setSimAway(e.target.value)}
                    className="w-14 border border-gray-300 rounded px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
            </div>
            <button
              onClick={() => act({ action: "simulate", matchId: simMatchId, homeScore: Number(simHome), awayScore: Number(simAway) })}
              disabled={busy || !simMatchId}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 rounded-lg transition disabled:opacity-40"
            >
              {busy ? "⏳ Running…" : "▶ Run Simulation"}
            </button>
          </div>
        </div>

        {/* Manual event triggers */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-1">Manual Event Triggers</h2>
          <p className="text-xs text-gray-400 mb-4">
            Trigger individual system jobs at the current virtual time, without advancing the clock.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => act({ action: "autoPredict" })}
              disabled={busy}
              className="w-full text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition text-left disabled:opacity-40"
            >
              🎲 Auto-predict for all demo users on all open matches
            </button>
            <button
              onClick={() => act({ action: "triggerReminders" })}
              disabled={busy}
              className="w-full text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition text-left disabled:opacity-40"
            >
              📧 Send match reminders (2hr window)
            </button>
            <button
              onClick={() => act({ action: "triggerPoll" })}
              disabled={busy}
              className="w-full text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition text-left disabled:opacity-40"
            >
              ⟳ Poll external scores (1h45m window)
            </button>
          </div>
        </div>
      </div>

      {/* ── Event log ────────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Event Log</h2>
          <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-gray-600 transition">
            Clear
          </button>
        </div>
        <div
          ref={logRef}
          className="bg-gray-950 rounded-lg p-4 font-mono text-xs text-green-400 h-56 overflow-y-auto space-y-1"
        >
          {log.length === 0 ? (
            <span className="text-gray-600">No events yet. Add matches, users, then run a simulation.</span>
          ) : (
            log.map((entry, i) => (
              <div key={i}>
                <span className="text-gray-600">[{entry.ts}]</span>{" "}
                <span>{entry.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
