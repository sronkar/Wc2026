"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [settings, setSettings] = useState<Settings>({ exactMatchPoints: 5, directionMatchPoints: 1 });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [resultInputs, setResultInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedMatches, setSavedMatches] = useState<Set<string>>(new Set());
  const [roundFilter, setRoundFilter] = useState("Group Stage");
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<{
    updated: number;
    checked: number;
    matches: { matchNumber: number; home: string; away: string; score: string }[];
    source: string | null;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [session, status, router]);

  useEffect(() => {
    if (!session || session.user.role !== "ADMIN") return;
    async function load() {
      const [mRes, sRes] = await Promise.all([
        fetch("/api/matches"),
        fetch("/api/admin/settings"),
      ]);
      const mData: Match[] = await mRes.json();
      setMatches(mData);
      const sData: Settings = await sRes.json();
      if (sData) setSettings(sData);

      const inputs: Record<string, { home: string; away: string }> = {};
      mData.forEach((m) => {
        inputs[m.id] = {
          home: m.homeScore !== null ? String(m.homeScore) : "",
          away: m.awayScore !== null ? String(m.awayScore) : "",
        };
      });
      setResultInputs(inputs);
    }
    load();
  }, [session]);

  const handlePollScores = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/admin/poll", { method: "POST" });
      const data = await res.json();
      setPollResult(data);
      if (data.updated > 0) {
        // Refresh match list to show new statuses
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

  const handleSaveResult = async (matchId: string, isOverride = false) => {
    const input = resultInputs[matchId];
    if (!input) return;
    const home = parseInt(input.home, 10);
    const away = parseInt(input.away, 10);
    if (isNaN(home) || isNaN(away)) return;

    if (isOverride) {
      const match = matches.find((m) => m.id === matchId);
      const confirmed = window.confirm(
        `Override score for ${match?.homeTeam} vs ${match?.awayTeam}?\n\n` +
        `Current: ${match?.homeScore ?? "?"} – ${match?.awayScore ?? "?"}\n` +
        `New:     ${home} – ${away}\n\n` +
        `This will recalculate points for all predictions on this match and resend notifications.`
      );
      if (!confirmed) return;
    }

    setSaving((prev) => ({ ...prev, [matchId]: true }));
    await fetch("/api/admin/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, homeScore: home, awayScore: away }),
    });
    setSaving((prev) => ({ ...prev, [matchId]: false }));
    setSavedMatches((prev) => new Set(Array.from(prev).concat(matchId)));
    setTimeout(() => setSavedMatches((prev) => { const s = new Set(Array.from(prev)); s.delete(matchId); return s; }), 2000);

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

  const ROUNDS = [
    "Group Stage",
    "Round of 32",
    "Round of 16",
    "Quarter-final",
    "Semi-final",
    "Third Place Play-off",
    "Final",
  ];

  const filtered = matches.filter((m) => m.round === roundFilter);

  if (status === "loading" || !session) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }
  if (session.user.role !== "ADMIN") return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin Panel</h1>
      <p className="text-gray-400 text-sm mb-8">Enter match results and manage point settings</p>

      {/* Point Settings */}
      <div className="card mb-8">
        <h2 className="font-bold text-gray-800 mb-4">Point Settings</h2>
        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Exact Score (pts)</label>
            <input
              type="number"
              min="0"
              value={settings.exactMatchPoints}
              onChange={(e) => setSettings((s) => ({ ...s, exactMatchPoints: Number(e.target.value) }))}
              className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Correct Winner/Draw (pts)</label>
            <input
              type="number"
              min="0"
              value={settings.directionMatchPoints}
              onChange={(e) => setSettings((s) => ({ ...s, directionMatchPoints: Number(e.target.value) }))}
              className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
          </div>
          <button onClick={handleSaveSettings} className="btn-primary">
            {settingsSaved ? "Saved ✓" : "Save Settings"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Note: changing settings here only affects future result entries. Re-save a match result to recalculate its points.
        </p>
      </div>

      {/* Auto Score Sync */}
      <div className="card mb-8">
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
                    <li key={m.matchNumber}>
                      #{m.matchNumber} {m.home} <strong>{m.score}</strong> {m.away}
                    </li>
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

      {/* Match Results */}
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
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={input.home}
                        onChange={(e) =>
                          setResultInputs((prev) => ({ ...prev, [match.id]: { ...prev[match.id], home: e.target.value } }))
                        }
                        className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        placeholder="0"
                      />
                      <span className="text-gray-400">–</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={input.away}
                        onChange={(e) =>
                          setResultInputs((prev) => ({ ...prev, [match.id]: { ...prev[match.id], away: e.target.value } }))
                        }
                        className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        placeholder="0"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${
                      match.status === "FINISHED" ? "bg-green-100 text-green-700" :
                      match.status === "LIVE" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {match.status.charAt(0) + match.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleSaveResult(match.id, match.status === "FINISHED")}
                      disabled={saving[match.id]}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
                        match.status === "FINISHED"
                          ? "bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                          : "btn-primary"
                      }`}
                    >
                      {saving[match.id]
                        ? "…"
                        : savedMatches.has(match.id)
                        ? "Saved ✓"
                        : match.status === "FINISHED"
                        ? "✎ Override"
                        : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
