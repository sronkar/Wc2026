"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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

interface Settings {
  exactMatchPoints: number;
  directionMatchPoints: number;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  createdAt: string;
}

interface PredictionRow {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  homeScore: number;
  awayScore: number;
  points: number | null;
}

type Tab = "results" | "predictions" | "settings" | "users";

const ROUNDS = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
];

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";

  // ── Results tab state ────────────────────────────────────────────────────────
  const [matches, setMatches] = useState<Match[]>([]);
  const [resultInputs, setResultInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedMatches, setSavedMatches] = useState<Set<string>>(new Set());
  const [roundFilter, setRoundFilter] = useState("Group Stage");

  // ── Settings tab state (admin only) ─────────────────────────────────────────
  const [settings, setSettings] = useState<Settings>({ exactMatchPoints: 5, directionMatchPoints: 1 });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<{
    updated: number;
    checked: number;
    matches: { matchNumber: number; home: string; away: string; score: string }[];
    source: string | null;
    error?: string;
  } | null>(null);

  // ── Users tab state (admin only) ─────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<Record<string, boolean>>({});

  // ── Predictions tab state ────────────────────────────────────────────────────
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [matchPredictions, setMatchPredictions] = useState<PredictionRow[]>([]);
  const [predInputs, setPredInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [loadingPreds, setLoadingPreds] = useState(false);
  const [savingPred, setSavingPred] = useState<Record<string, boolean>>({});
  const [savedPreds, setSavedPreds] = useState<Set<string>>(new Set());

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("results");

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "loading") return;
    if (!session || (role !== "ADMIN" && role !== "SUB_ADMIN")) {
      router.replace("/");
    }
  }, [session, status, router, role]);

  // ── Initial data load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || (role !== "ADMIN" && role !== "SUB_ADMIN")) return;

    async function load() {
      const mRes = await fetch("/api/matches");
      const mData: Match[] = await mRes.json();
      setMatches(mData);

      const inputs: Record<string, { home: string; away: string }> = {};
      mData.forEach((m) => {
        inputs[m.id] = {
          home: m.homeScore !== null ? String(m.homeScore) : "",
          away: m.awayScore !== null ? String(m.awayScore) : "",
        };
      });
      setResultInputs(inputs);

      if (role === "ADMIN") {
        const sRes = await fetch("/api/admin/settings");
        const sData: Settings = await sRes.json();
        if (sData) setSettings(sData);
      }
    }
    load();
  }, [session, role]);

  // ── Load users when Users tab is first opened ────────────────────────────────
  useEffect(() => {
    if (activeTab !== "users" || usersLoaded || !isAdmin) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: UserRow[]) => {
        setUsers(data);
        setUsersLoaded(true);
      });
  }, [activeTab, usersLoaded, isAdmin]);

  // ── Load predictions when a match is selected ────────────────────────────────
  useEffect(() => {
    if (!selectedMatchId) {
      setMatchPredictions([]);
      setPredInputs({});
      return;
    }
    setLoadingPreds(true);
    fetch(`/api/admin/matches/${selectedMatchId}/predictions`)
      .then((r) => r.json())
      .then((data: PredictionRow[]) => {
        setMatchPredictions(data);
        const inputs: Record<string, { home: string; away: string }> = {};
        data.forEach((p) => {
          inputs[p.userId] = { home: String(p.homeScore), away: String(p.awayScore) };
        });
        setPredInputs(inputs);
      })
      .finally(() => setLoadingPreds(false));
  }, [selectedMatchId]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handlePollScores = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/admin/poll", { method: "POST" });
      const data = await res.json();
      setPollResult(data);
      if (data.updated > 0) {
        const mRes = await fetch("/api/matches");
        const mData: Match[] = await mRes.json();
        setMatches(mData);
        const inputs: Record<string, { home: string; away: string }> = {};
        mData.forEach((m) => {
          inputs[m.id] = {
            home: m.homeScore !== null ? String(m.homeScore) : "",
            away: m.awayScore !== null ? String(m.awayScore) : "",
          };
        });
        setResultInputs(inputs);
      }
    } finally {
      setPolling(false);
    }
  };

  const handleSaveResult = async (matchId: string) => {
    const input = resultInputs[matchId];
    if (!input) return;
    const home = parseInt(input.home, 10);
    const away = parseInt(input.away, 10);
    if (isNaN(home) || isNaN(away)) return;

    setSaving((prev) => ({ ...prev, [matchId]: true }));
    await fetch("/api/admin/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, homeScore: home, awayScore: away }),
    });
    setSaving((prev) => ({ ...prev, [matchId]: false }));
    setSavedMatches((prev) => new Set(Array.from(prev).concat(matchId)));
    setTimeout(
      () => setSavedMatches((prev) => { const s = new Set(Array.from(prev)); s.delete(matchId); return s; }),
      2000
    );
    setMatches((prev) =>
      prev.map((m) => m.id === matchId ? { ...m, homeScore: home, awayScore: away, status: "FINISHED" } : m)
    );
  };

  const handleSaveSettings = async () => {
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "SUB_ADMIN" ? "USER" : "SUB_ADMIN";
    setRoleUpdating((prev) => ({ ...prev, [userId]: true }));
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const updated: UserRow = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: updated.role } : u));
    }
    setRoleUpdating((prev) => ({ ...prev, [userId]: false }));
  };

  const handleSavePrediction = async (userId: string) => {
    const input = predInputs[userId];
    if (!input || !selectedMatchId) return;
    const home = parseInt(input.home, 10);
    const away = parseInt(input.away, 10);
    if (isNaN(home) || isNaN(away)) return;

    setSavingPred((prev) => ({ ...prev, [userId]: true }));
    await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, matchId: selectedMatchId, homeScore: home, awayScore: away }),
    });
    setSavingPred((prev) => ({ ...prev, [userId]: false }));
    setSavedPreds((prev) => new Set(Array.from(prev).concat(userId)));
    setTimeout(
      () => setSavedPreds((prev) => { const s = new Set(Array.from(prev)); s.delete(userId); return s; }),
      2000
    );
    setMatchPredictions((prev) =>
      prev.map((p) => p.userId === userId ? { ...p, homeScore: home, awayScore: away } : p)
    );
  };

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (status === "loading" || !session) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }
  if (role !== "ADMIN" && role !== "SUB_ADMIN") return null;

  const filtered = matches.filter((m) => m.round === roundFilter);
  const selectedMatch = matches.find((m) => m.id === selectedMatchId);

  const tabs: { key: Tab; label: string }[] = [
    { key: "results", label: "Match Results" },
    { key: "predictions", label: "Edit Predictions" },
    ...(isAdmin ? [
      { key: "settings" as Tab, label: "Settings" },
      { key: "users" as Tab, label: "Users" },
    ] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        {isAdmin ? "Admin Panel" : "Moderator Panel"}
      </h1>
      <p className="text-gray-400 text-sm mb-6">
        {isAdmin ? "Manage results, predictions, settings and users" : "Update match results and edit user predictions"}
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === t.key
                ? "border-fifa-blue text-fifa-blue"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Match Results tab ──────────────────────────────────────────────────── */}
      {activeTab === "results" && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {ROUNDS.map((r) => (
              <button
                key={r}
                onClick={() => setRoundFilter(r)}
                className={`text-sm px-3 py-1.5 rounded-full border transition ${
                  roundFilter === r
                    ? "bg-fifa-blue text-white border-fifa-blue"
                    : "border-gray-300 text-gray-600 hover:border-fifa-blue"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Kickoff</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((match, i) => {
                  const isFinished = match.status === "FINISHED";
                  const input = resultInputs[match.id] ?? { home: "", away: "" };
                  return (
                    <tr key={match.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3 text-gray-400">{match.matchNumber}</td>
                      <td className="px-4 py-3 font-medium">
                        <div>{match.homeTeam} vs {match.awayTeam}</div>
                        <div className="text-xs text-gray-400">{match.city}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(match.kickoff).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                          timeZoneName: "short",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {isFinished ? (
                          <span className="font-bold text-gray-700">
                            {match.homeScore} – {match.awayScore}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min="0" max="20" value={input.home}
                              onChange={(e) =>
                                setResultInputs((prev) => ({ ...prev, [match.id]: { ...prev[match.id], home: e.target.value } }))
                              }
                              className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                              placeholder="0"
                            />
                            <span className="text-gray-400">–</span>
                            <input
                              type="number" min="0" max="20" value={input.away}
                              onChange={(e) =>
                                setResultInputs((prev) => ({ ...prev, [match.id]: { ...prev[match.id], away: e.target.value } }))
                              }
                              className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                              placeholder="0"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${
                          isFinished ? "bg-green-100 text-green-700" :
                          match.status === "LIVE" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {match.status.charAt(0) + match.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isFinished ? (
                          <span className="text-xs text-gray-400 flex items-center gap-1">🔒 Locked</span>
                        ) : (
                          <button
                            onClick={() => handleSaveResult(match.id)}
                            disabled={saving[match.id]}
                            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                          >
                            {saving[match.id] ? "…" : savedMatches.has(match.id) ? "Saved ✓" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Edit Predictions tab ───────────────────────────────────────────────── */}
      {activeTab === "predictions" && (
        <div>
          <div className="card mb-6">
            <h2 className="font-bold text-gray-800 mb-3">Select Match</h2>
            <select
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            >
              <option value="">— choose a match —</option>
              {ROUNDS.map((round) => {
                const roundMatches = matches.filter((m) => m.round === round);
                if (roundMatches.length === 0) return null;
                return (
                  <optgroup key={round} label={round}>
                    {roundMatches.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.matchNumber} {m.homeTeam} vs {m.awayTeam}
                        {m.status === "FINISHED" ? ` (${m.homeScore}–${m.awayScore})` : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {selectedMatch && (
              <p className="text-xs text-gray-400 mt-2">
                {new Date(selectedMatch.kickoff).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
                })} · {selectedMatch.city} · Status: <span className="font-medium">{selectedMatch.status}</span>
              </p>
            )}
          </div>

          {selectedMatchId && (
            <>
              {selectedMatch && Date.now() >= new Date(selectedMatch.kickoff).getTime() - 60 * 60 * 1000 && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
                  🔒 <strong>Predictions locked.</strong> This match is within 1 hour of kickoff or has finished — no edits allowed.
                </div>
              )}
            <div className="card overflow-hidden p-0">
              {loadingPreds ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading predictions…</div>
              ) : matchPredictions.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No predictions for this match yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Prediction</th>
                      <th className="px-4 py-3">Points</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchPredictions.map((pred, i) => {
                      const isLocked = selectedMatch
                        ? Date.now() >= new Date(selectedMatch.kickoff).getTime() - 60 * 60 * 1000
                        : false;
                      const input = predInputs[pred.userId] ?? { home: String(pred.homeScore), away: String(pred.awayScore) };
                      return (
                        <tr key={pred.userId} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {pred.userImage ? (
                                <Image src={pred.userImage} alt="" width={28} height={28} className="rounded-full" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                  {pred.userName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="font-medium text-gray-800">{pred.userName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {isLocked ? (
                              <span className="font-semibold text-gray-700">{pred.homeScore} – {pred.awayScore}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number" min="0" max="20" value={input.home}
                                  onChange={(e) =>
                                    setPredInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], home: e.target.value } }))
                                  }
                                  className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                                />
                                <span className="text-gray-400">–</span>
                                <input
                                  type="number" min="0" max="20" value={input.away}
                                  onChange={(e) =>
                                    setPredInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], away: e.target.value } }))
                                  }
                                  className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                                />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {pred.points !== null ? (
                              <span className="font-semibold text-fifa-blue">{pred.points} pts</span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {isLocked ? (
                              <span className="text-xs text-gray-400">🔒 Locked</span>
                            ) : (
                              <button
                                onClick={() => handleSavePrediction(pred.userId)}
                                disabled={savingPred[pred.userId]}
                                className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                              >
                                {savingPred[pred.userId] ? "…" : savedPreds.has(pred.userId) ? "Saved ✓" : "✎ Edit"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            </>
          )}
        </div>
      )}

      {/* ── Settings tab (admin only) ─────────────────────────────────────────── */}
      {activeTab === "settings" && isAdmin && (
        <>
          <div className="card mb-8">
            <h2 className="font-bold text-gray-800 mb-4">Point Settings</h2>
            <div className="flex flex-wrap gap-6 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Exact Score (pts)</label>
                <input
                  type="number" min="0" value={settings.exactMatchPoints}
                  onChange={(e) => setSettings((s) => ({ ...s, exactMatchPoints: Number(e.target.value) }))}
                  className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Correct Winner/Draw (pts)</label>
                <input
                  type="number" min="0" value={settings.directionMatchPoints}
                  onChange={(e) => setSettings((s) => ({ ...s, directionMatchPoints: Number(e.target.value) }))}
                  className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <button onClick={handleSaveSettings} className="btn-primary">
                {settingsSaved ? "Saved ✓" : "Save Settings"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Note: changing settings only affects future result entries. Re-save a match result to recalculate its points.
            </p>
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-800">Auto Score Sync</h2>
                <p className="text-xs text-gray-400 mt-1 max-w-md">
                  Fetches finished match scores automatically every 5 minutes (1h 45m after kickoff).
                  Uses <strong>football-data.org</strong> if you set <code className="bg-gray-100 px-1 rounded">FOOTBALL_DATA_API_KEY</code>,
                  otherwise falls back to ESPN&apos;s unofficial API.
                </p>
              </div>
              <button
                onClick={handlePollScores}
                disabled={polling}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                {polling ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Checking…
                  </>
                ) : (
                  "⟳ Sync Scores Now"
                )}
              </button>
            </div>

            {pollResult && (
              <div className={`mt-4 rounded-lg p-3 text-sm ${
                pollResult.updated > 0
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : pollResult.error
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-gray-50 border border-gray-200 text-gray-600"
              }`}>
                {pollResult.updated > 0 ? (
                  <>
                    <p className="font-semibold">✓ Updated {pollResult.updated} match{pollResult.updated > 1 ? "es" : ""} via {pollResult.source}</p>
                    <ul className="mt-1 space-y-0.5">
                      {pollResult.matches.map((m) => (
                        <li key={m.matchNumber}>#{m.matchNumber} {m.home} <strong>{m.score}</strong> {m.away}</li>
                      ))}
                    </ul>
                  </>
                ) : pollResult.error ? (
                  <p>⚠ {pollResult.error} — no scores available yet from any source.</p>
                ) : (
                  <p>
                    Checked {pollResult.checked} pending match{pollResult.checked !== 1 ? "es" : ""} —
                    {pollResult.checked === 0
                      ? " no matches in the polling window (1h 45m–8h after kickoff)."
                      : " no finished scores found yet. Will retry automatically."}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Users tab (admin only) ────────────────────────────────────────────── */}
      {activeTab === "users" && isAdmin && (
        <div className="card overflow-hidden p-0">
          {!usersLoaded ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading users…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.image ? (
                          <Image src={user.image} alt="" width={28} height={28} className="rounded-full" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                            {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-gray-800">{user.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${
                        user.role === "ADMIN" ? "bg-purple-100 text-purple-700" :
                        user.role === "SUB_ADMIN" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {user.role === "ADMIN" ? "Admin" : user.role === "SUB_ADMIN" ? "Sub-admin" : "User"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.role !== "ADMIN" && user.id !== session.user.id && (
                        <button
                          onClick={() => handleRoleToggle(user.id, user.role)}
                          disabled={roleUpdating[user.id]}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition disabled:opacity-50 ${
                            user.role === "SUB_ADMIN"
                              ? "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                              : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                          }`}
                        >
                          {roleUpdating[user.id]
                            ? "…"
                            : user.role === "SUB_ADMIN"
                            ? "Remove sub-admin"
                            : "Make sub-admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
