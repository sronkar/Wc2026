"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SimMatch {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  group: string | null;
  round: string;
  kickoff: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  predictionCount: number;
  isLocked: boolean;
  isScoredInSim: boolean;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  points: number;
}

interface SimState {
  active: boolean;
  virtualTime: string;
  realTime: string;
  simulationMatchIds: string[];
  matches: SimMatch[];
  leaderboard: LeaderboardEntry[];
}

const ROUND_ORDER = [
  "Group Stage", "Round of 32", "Round of 16",
  "Quarter-final", "Semi-final", "Third Place Play-off", "Final",
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZoneName: "short",
  });
}

function relativeToKickoff(kickoffIso: string, nowIso: string) {
  const diffMin = Math.round((new Date(kickoffIso).getTime() - new Date(nowIso).getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  const fmt = abs < 60
    ? `${abs}m`
    : abs < 1440
    ? `${Math.floor(abs / 60)}h${abs % 60 ? `${abs % 60}m` : ""}`
    : `${Math.floor(abs / 1440)}d`;
  return diffMin > 0 ? `T-${fmt}` : diffMin < 0 ? `T+${fmt}` : "T";
}

export function SimulationPanel() {
  const [state, setState] = useState<SimState | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ ts: string; text: string; ok: boolean }[]>([]);
  const [scoreInputs, setScoreInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [customTimeIso, setCustomTimeIso] = useState("");
  const [roundFilter, setRoundFilter] = useState("all");
  const [showFinished, setShowFinished] = useState(false);
  const [testInviteUrl, setTestInviteUrl] = useState<string | null>(null);
  const [testResetUrl, setTestResetUrl] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/simulation");
    if (!res.ok) return;
    const data: SimState = await res.json();
    setState(data);
    setScoreInputs((prev) => {
      const next = { ...prev };
      data.matches.forEach((m) => {
        if (!next[m.id]) {
          next[m.id] = {
            home: m.homeScore != null ? String(m.homeScore) : "0",
            away: m.awayScore != null ? String(m.awayScore) : "0",
          };
        }
      });
      return next;
    });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const act = useCallback(async (body: object, label: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const ts = new Date().toLocaleTimeString();
      const ok = res.ok && data.ok;
      const text = data.error ?? label;
      setLog((prev) => [...prev, { ts, text, ok }]);
      await load();
      return data;
    } finally {
      setBusy(false);
    }
  }, [load]);

  const genTestInvite = useCallback(async () => {
    const data = await act({ action: "genTestInvite" }, "Generated test invite link");
    if (data?.url) setTestInviteUrl(data.url);
  }, [act]);

  const genTestResetLink = useCallback(async () => {
    const data = await act({ action: "genTestResetLink" }, "Generated test reset link");
    if (data?.url) setTestResetUrl(data.url);
  }, [act]);

  if (!state) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  }

  const virtualNow = state.virtualTime;
  const timeDiffMs = new Date(state.virtualTime).getTime() - new Date(state.realTime).getTime();
  const timeDiffMin = Math.round(timeDiffMs / 60_000);
  const timeDiffLabel = timeDiffMin === 0
    ? "in sync with real time"
    : timeDiffMin > 0
    ? `${Math.abs(timeDiffMin) < 60 ? `${Math.abs(timeDiffMin)}m` : `${Math.floor(Math.abs(timeDiffMin) / 60)}h${Math.abs(timeDiffMin) % 60 ? `${Math.abs(timeDiffMin) % 60}m` : ""}`} ahead of real time`
    : `${Math.abs(timeDiffMin) < 60 ? `${Math.abs(timeDiffMin)}m` : `${Math.floor(Math.abs(timeDiffMin) / 60)}h${Math.abs(timeDiffMin) % 60 ? `${Math.abs(timeDiffMin) % 60}m` : ""}`} behind real time`;

  const rounds = ["all", ...ROUND_ORDER.filter((r) => state.matches.some((m) => m.round === r))];
  const visibleMatches = state.matches.filter((m) => {
    if (!showFinished && m.status === "FINISHED" && !m.isScoredInSim) return false;
    if (roundFilter !== "all" && m.round !== roundFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ── */}
      <div className={`rounded-xl px-6 py-4 text-white ${state.active ? "bg-gradient-to-r from-amber-700 to-orange-600" : "bg-gradient-to-r from-gray-700 to-gray-600"}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${state.active ? "bg-amber-300 text-black" : "bg-gray-400 text-white"}`}>
                {state.active ? "SIMULATION ACTIVE" : "SIMULATION OFF"}
              </span>
              <h1 className="font-bold text-lg">Simulation Mode</h1>
            </div>
            <p className="text-white/70 text-xs">
              {state.active
                ? "Virtual time is active. Locking and scoring use the clock below, not real time."
                : "Activate to control virtual time and test locking, scoring, and points."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!state.active ? (
              <button
                onClick={() => act({ action: "activate" }, "Simulation activated")}
                disabled={busy}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-white text-orange-700 hover:bg-orange-50 transition disabled:opacity-40"
              >
                Activate Simulation
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (confirm("Deactivate simulation? Virtual time resets — scored matches are kept as-is.")) {
                      act({ action: "deactivate" }, "Simulation deactivated");
                    }
                  }}
                  disabled={busy}
                  className="text-xs border border-white/40 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                >
                  Deactivate
                </button>
                <button
                  onClick={() => {
                    const count = state.simulationMatchIds.length;
                    if (confirm(`Clear simulation? This resets virtual time AND undoes ${count} match score${count !== 1 ? "s" : ""} set during this session.`)) {
                      act({ action: "clear" }, `Simulation cleared — ${count} match${count !== 1 ? "es" : ""} reset`);
                    }
                  }}
                  disabled={busy}
                  className="text-xs border border-red-400 text-red-300 hover:bg-red-900/30 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                >
                  Clear &amp; Reset All
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Virtual time controls (only when active) ── */}
      {state.active && (
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Virtual time</p>
              <p className="text-xl font-bold text-gray-800 font-mono">{fmtTime(state.virtualTime)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{timeDiffLabel}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Real time</p>
              <p className="text-sm text-gray-500 font-mono">{fmtTime(state.realTime)}</p>
            </div>
          </div>

          <p className="text-xs font-semibold text-gray-500 mb-2">Advance virtual time</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { label: "+5m", m: 5 },
              { label: "+30m", m: 30 },
              { label: "+1h", m: 60 },
              { label: "+2h", m: 120 },
              { label: "+6h", m: 360 },
              { label: "+12h", m: 720 },
              { label: "+1d", m: 1440 },
              { label: "+7d", m: 10080 },
            ].map(({ label, m }) => (
              <button
                key={label}
                onClick={() => act({ action: "advanceTime", minutes: m }, `Advanced time by ${label}`)}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 transition disabled:opacity-40"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                if (!window.confirm("Sync virtual time to real time now? This will jump the simulation clock forward immediately.")) return;
                act({ action: "setTime", iso: new Date().toISOString() }, "Time synced to real time");
              }}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
            >
              Sync to real time
            </button>
          </div>

          {/* Jump to specific time or near a match kickoff */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500 font-semibold shrink-0">Jump to:</p>
            <input
              type="datetime-local"
              value={customTimeIso}
              onChange={(e) => setCustomTimeIso(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              onClick={() => { if (!customTimeIso) return; act({ action: "setTime", iso: new Date(customTimeIso).toISOString() }, `Jumped to ${customTimeIso}`); }}
              disabled={busy || !customTimeIso}
              className="text-xs px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition disabled:opacity-40"
            >
              Go
            </button>
          </div>

          {/* Quick jump near specific matches */}
          {state.matches.filter((m) => m.status !== "FINISHED").slice(0, 5).map((m) => (
            <div key={m.id} className="flex items-center gap-1 flex-wrap mt-2">
              <span className="text-xs text-gray-400 shrink-0">#{m.matchNumber} {m.homeTeam} vs {m.awayTeam}:</span>
              {[{ label: "T-2h", offset: -120 }, { label: "T-1h", offset: -60 }, { label: "T-55m (locks in 5m)", offset: -55 }, { label: "T+2h", offset: 120 }].map(({ label, offset }) => (
                <button
                  key={label}
                  onClick={() => act({ action: "setTime", iso: new Date(new Date(m.kickoff).getTime() + offset * 60_000).toISOString() }, `Jumped to ${label} of #${m.matchNumber}`)}
                  disabled={busy}
                  className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-600 transition disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Leaderboard snapshot ── */}
      {state.active && state.leaderboard.length > 0 && (
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3">Current Leaderboard (all groups combined)</h2>
          <div className="space-y-1.5">
            {state.leaderboard.map((e, i) => (
              <div key={e.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0">#{i + 1}</span>
                <span className="flex-1 text-gray-700 font-medium">{e.name}</span>
                <span className="font-bold text-orange-600 tabular-nums">{e.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Match table ── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold text-gray-800">
            Matches
            {state.active && <span className="ml-2 text-xs font-normal text-gray-400">— lock status relative to virtual time</span>}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} className="rounded" />
              Show finished
            </label>
            <select
              value={roundFilter}
              onChange={(e) => setRoundFilter(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {rounds.map((r) => <option key={r} value={r}>{r === "all" ? "All rounds" : r}</option>)}
            </select>
          </div>
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200 text-xs">
                <th className="px-4 py-3">Match</th>
                <th className="px-3 py-3">Kickoff</th>
                <th className="px-3 py-3">Lock status</th>
                <th className="px-3 py-3 text-center">Predictions</th>
                <th className="px-3 py-3">Score</th>
                {state.active && <th className="px-3 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visibleMatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No matches to show. Toggle &quot;Show finished&quot; or change the round filter.
                  </td>
                </tr>
              ) : visibleMatches.map((m, i) => {
                const inp = scoreInputs[m.id] ?? { home: "0", away: "0" };
                const kickoffMs = new Date(m.kickoff).getTime();
                const lockMs = kickoffMs - 60 * 60 * 1000;
                const virtualNowMs = new Date(virtualNow).getTime();
                const minutesToLock = Math.round((lockMs - virtualNowMs) / 60_000);

                return (
                  <tr key={m.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${m.isScoredInSim ? "ring-1 ring-inset ring-amber-200" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">
                        <span className="text-xs text-gray-400 mr-1">#{m.matchNumber}</span>
                        {m.homeTeam} vs {m.awayTeam}
                      </div>
                      <div className="text-xs text-gray-400">{m.round}{m.group ? ` · Group ${m.group}` : ""}</div>
                      {m.isScoredInSim && (
                        <span className="text-xs text-amber-600 font-medium">sim-scored</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(m.kickoff).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {state.active && (
                        <div className="text-gray-400">{relativeToKickoff(m.kickoff, virtualNow)}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.status === "FINISHED" ? (
                        <span className="badge bg-gray-100 text-gray-500">Finished</span>
                      ) : m.isLocked ? (
                        <span className="badge bg-red-100 text-red-700">🔒 Locked</span>
                      ) : state.active ? (
                        minutesToLock <= 0 ? (
                          <span className="badge bg-red-100 text-red-700">🔒 Locked</span>
                        ) : minutesToLock <= 60 ? (
                          <span className="badge bg-amber-100 text-amber-700">
                            Locks in {minutesToLock}m
                          </span>
                        ) : (
                          <span className="badge bg-green-100 text-green-700">Open</span>
                        )
                      ) : (
                        <span className="badge bg-green-100 text-green-700">Open</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-sm font-medium ${m.predictionCount === 0 ? "text-gray-300" : "text-gray-700"}`}>
                        {m.predictionCount}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {m.status === "FINISHED" && !state.active ? (
                        <span className="text-sm font-bold text-gray-700">{m.homeScore}–{m.awayScore}</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min="0" max="20"
                            value={inp.home}
                            onChange={(e) => setScoreInputs((p) => ({ ...p, [m.id]: { ...p[m.id], home: e.target.value } }))}
                            className="w-10 border border-gray-300 rounded px-1 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                          />
                          <span className="text-gray-400 text-xs">–</span>
                          <input
                            type="number" min="0" max="20"
                            value={inp.away}
                            onChange={(e) => setScoreInputs((p) => ({ ...p, [m.id]: { ...p[m.id], away: e.target.value } }))}
                            className="w-10 border border-gray-300 rounded px-1 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                          />
                        </div>
                      )}
                    </td>
                    {state.active && (
                      <td className="px-3 py-3">
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => act({ action: "setScore", matchId: m.id, homeScore: Number(inp.home), awayScore: Number(inp.away) }, `Scored #${m.matchNumber}: ${m.homeTeam} ${inp.home}–${inp.away} ${m.awayTeam}`)}
                            disabled={busy}
                            className="text-xs px-2 py-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50 transition disabled:opacity-40 whitespace-nowrap"
                          >
                            {m.status === "FINISHED" ? "Re-score" : "Set score"}
                          </button>
                          {m.isScoredInSim && (
                            <button
                              onClick={() => act({ action: "resetMatch", matchId: m.id }, `Reset #${m.matchNumber} to SCHEDULED`)}
                              disabled={busy}
                              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-600 transition disabled:opacity-40"
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Auth Flow Testing ── */}
      <div className="card">
        <h2 className="font-bold text-gray-800 mb-1">Auth Flow Testing</h2>
        <p className="text-xs text-gray-400 mb-4">
          Generate one-click auth links to test invite and password-reset flows without checking your email.
        </p>
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-2 min-w-0">
            <button
              onClick={genTestInvite}
              disabled={busy}
              className="text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40 whitespace-nowrap self-start"
            >
              Generate test invite link
            </button>
            {testInviteUrl && (
              <a
                href={testInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 break-all"
              >
                {testInviteUrl}
              </a>
            )}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <button
              onClick={genTestResetLink}
              disabled={busy}
              className="text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40 whitespace-nowrap self-start"
            >
              Generate test reset link
            </button>
            {testResetUrl && (
              <a
                href={testResetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 break-all"
              >
                {testResetUrl}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Event log ── */}
      {log.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">Session Log</h2>
            <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          <div
            ref={logRef}
            className="bg-gray-950 rounded-lg p-4 font-mono text-xs h-40 overflow-y-auto space-y-1"
          >
            {log.map((entry, i) => (
              <div key={i}>
                <span className="text-gray-600">[{entry.ts}]</span>{" "}
                <span className={entry.ok ? "text-green-400" : "text-red-400"}>{entry.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
