"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFlag } from "@/lib/flags";
import Image from "next/image";
import Link from "next/link";

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

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myStatus: string | null;
}

interface GlobalPrediction {
  id: string;
  question: string;
  optionType: string;
  points: number;
  lockTime: string;
  status: string;
  answerCount: number;
}

type Tab = "results" | "settings" | "users" | "groups";

const ROUNDS = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
];

function AdminPage() {
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

  // ── Groups tab state ──────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [globalPreds, setGlobalPreds] = useState<GlobalPrediction[]>([]);
  const [deletingGlobalPred, setDeletingGlobalPred] = useState<Record<string, boolean>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupVisitor, setNewGroupVisitor] = useState(false);
  const [newGroupPublic, setNewGroupPublic] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // ── Tab state ────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (t === "groups" || t === "settings" || t === "users" || t === "results") ? t as Tab : "results";
  });

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
      .then((data: UserRow[]) => { setUsers(data); setUsersLoaded(true); });
  }, [activeTab, usersLoaded, isAdmin]);

  // ── Load groups + global predictions when Groups tab is opened ───────────────
  useEffect(() => {
    if (activeTab !== "groups" || groupsLoaded) return;
    Promise.all([
      fetch("/api/groups").then((r) => r.json()),
      fetch("/api/admin/custom-predictions").then((r) => r.json()),
    ]).then(([groupData, predData]) => {
      if (Array.isArray(groupData)) setGroups(groupData);
      if (Array.isArray(predData)) setGlobalPreds(predData);
      setGroupsLoaded(true);
    });
  }, [activeTab, groupsLoaded]);

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

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (status === "loading" || !session) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }
  if (role !== "ADMIN" && role !== "SUB_ADMIN") return null;

  const filtered = matches.filter((m) => m.round === roundFilter);

  const handleDeleteGlobalPred = async (id: string) => {
    if (!confirm("Delete this global prediction and all answers?")) return;
    setDeletingGlobalPred((p) => ({ ...p, [id]: true }));
    const res = await fetch(`/api/admin/custom-predictions/${id}`, { method: "DELETE" });
    if (res.ok) setGlobalPreds((prev) => prev.filter((p) => p.id !== id));
    setDeletingGlobalPred((p) => ({ ...p, [id]: false }));
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroupName, description: newGroupDesc, joinAsVisitor: newGroupVisitor, isPublic: newGroupPublic }),
    });
    if (res.ok) {
      const g = await res.json();
      setGroups((prev) => [...prev, { ...g, memberCount: 1, myStatus: "APPROVED" }]);
      setNewGroupName("");
      setNewGroupDesc("");
      setNewGroupVisitor(false);
      setNewGroupPublic(false);
      window.dispatchEvent(new Event("wc2026:groups-updated"));
    }
    setCreatingGroup(false);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "results", label: "Match Results" },
    { key: "groups", label: "Groups" },
    ...(isAdmin ? [
      { key: "settings" as Tab, label: "Point Defaults" },
      { key: "users" as Tab, label: "Users" },
    ] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        {isAdmin ? "Admin Panel" : "Moderator Panel"}
      </h1>
      <p className="text-gray-400 text-sm mb-6">
        {isAdmin ? "Manage match results, global point defaults and user roles" : "Update match results"}
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
                        <div>{getFlag(match.homeTeam)} {match.homeTeam} vs {match.awayTeam} {getFlag(match.awayTeam)}</div>
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

      {/* ── Point Defaults tab (admin only) ─────────────────────────────────────── */}
      {activeTab === "settings" && isAdmin && (
        <>
          <div className="card mb-8">
            <h2 className="font-bold text-gray-800 mb-1">Point Defaults</h2>
            <p className="text-xs text-gray-400 mb-4">
              These are the defaults used when creating a new group. Each group can override them.
            </p>
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
                {settingsSaved ? "Saved ✓" : "Save Defaults"}
              </button>
            </div>
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

      {/* ── Groups tab ───────────────────────────────────────────────────────── */}
      {activeTab === "groups" && (
        <div className="space-y-6">
          {/* Create group form */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-4">Create New Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Group Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Office League 2026"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="A short description"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={newGroupVisitor}
                  onChange={(e) => setNewGroupVisitor(e.target.checked)}
                  className="rounded border-gray-300 text-fifa-blue focus:ring-fifa-blue"
                />
                Join as Visitor Admin (manage only — no predictions or leaderboard)
              </label>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Visibility</label>
                <div className="relative group inline-flex">
                  <div className="flex rounded-lg border border-gray-300 text-sm overflow-hidden">
                    <button type="button" onClick={() => setNewGroupPublic(false)}
                      className={`px-3 py-2 flex items-center gap-1.5 transition ${!newGroupPublic ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                      🔒 Private
                    </button>
                    <button type="button" onClick={() => setNewGroupPublic(true)}
                      className={`px-3 py-2 flex items-center gap-1.5 transition border-l border-gray-300 ${newGroupPublic ? "bg-fifa-blue text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                      🌐 Public
                    </button>
                  </div>
                  <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-10 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg pointer-events-none">
                    <p><strong className="text-white">🔒 Private</strong> — Only users with a join link or email invite can access.</p>
                    <p className="mt-1.5"><strong className="text-white">🌐 Public</strong> — Anyone can find and request to join via the Groups search page.</p>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={creatingGroup} className="btn-primary disabled:opacity-50">
                {creatingGroup ? "Creating…" : "Create Group"}
              </button>
            </form>
          </div>

          {/* Global predictions */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-sm">Global Custom Predictions ({globalPreds.length})</h2>
                <p className="text-xs text-gray-400 mt-0.5">Shown in every group automatically.</p>
              </div>
            </div>
            {globalPreds.length === 0 ? (
              <p className="px-4 py-6 text-center text-gray-400 text-sm">No global predictions yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-left border-b border-gray-200 bg-white">
                    <th className="px-4 py-2">Question</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Pts</th>
                    <th className="px-4 py-2">Answers</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {globalPreds.map((pred, i) => (
                    <tr key={pred.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                        <p className="truncate">{pred.question}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {pred.optionType === "TEAM" ? "⚽ Team" : pred.optionType === "PLAYER" ? "🧑 Player" : "Custom"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{pred.points}</td>
                      <td className="px-4 py-3 text-gray-500">{pred.answerCount}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${pred.status === "RESOLVED" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {pred.status === "RESOLVED" ? "Resolved" : "Open"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteGlobalPred(pred.id)}
                          disabled={deletingGlobalPred[pred.id]}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                        >
                          {deletingGlobalPred[pred.id] ? "…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Existing groups */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-bold text-gray-800 text-sm">All Groups ({groups.length})</h2>
            </div>
            {groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">No groups yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-left border-b border-gray-200 bg-white">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Members</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={g.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{g.name}</p>
                        {g.description && <p className="text-xs text-gray-400">{g.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{g.memberCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link href={`/groups/${g.id}`} className="text-xs text-gray-400 hover:text-gray-700">
                            View
                          </Link>
                          <Link href={`/admin/groups/${g.id}`} className="text-xs font-semibold text-fifa-blue hover:underline">
                            Manage →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
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


export default function AdminPageWrapper() {
  return (
    <Suspense>
      <AdminPage />
    </Suspense>
  );
}
