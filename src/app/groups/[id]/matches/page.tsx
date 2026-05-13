"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MatchCard } from "@/components/MatchCard";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { GroupStandingsPanel } from "@/components/GroupStandingsPanel";
import { CustomPredictionsPanel } from "@/components/dashboard/CustomPredictionsPanel";
import { loadStagePoints, isLegacyUniformFill } from "@/lib/stagePoints";

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
  matchId: string;
  homeScore: number;
  awayScore: number;
  points: number | null;
}

const ROUNDS = [
  "All",
  "General",
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
];

const GROUPS = ["All", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const ROUND_ORDER = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
];

export default function GroupMatchesPage() {
  const { data: session, status } = useSession();
  const { id: groupId } = useParams<{ id: string }>();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [roundFilter, setRoundFilter] = useState("All");
  const [groupFilter, setGroupFilter] = useState("All");
  const [hideResolved, setHideResolved] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [alerts, setAlerts] = useState<{ id: string; text: string; type: "warn" | "score" }[]>([]);
  const [groupSettings, setGroupSettings] = useState<{
    exact: number;
    direction: number;
    stagePoints: Record<string, { exact: number; direction: number }>;
  }>({ exact: 5, direction: 1, stagePoints: {} });
  const prevStatuses = useRef<Record<string, string>>({});
  const warnedLocks = useRef<Set<string>>(new Set());

  const dismissAlert = useCallback((id: string) => {
    setAlerts((a) => a.filter((x) => x.id !== id));
  }, []);

  // Load filters from localStorage after mount
  useEffect(() => {
    try {
      const r = localStorage.getItem("wc2026_round");
      const g = localStorage.getItem("wc2026_group_filter");
      const h = localStorage.getItem("wc2026_hide_resolved");
      const c = localStorage.getItem("wc2026_collapsed");
      if (r) setRoundFilter(r);
      if (g) setGroupFilter(g);
      if (h) setHideResolved(h === "1");
      if (c) setCollapsed(JSON.parse(c));
    } catch {}
    setFiltersLoaded(true);
  }, []);

  // Persist filters
  useEffect(() => {
    if (!filtersLoaded) return;
    try { localStorage.setItem("wc2026_round", roundFilter); } catch {}
  }, [roundFilter, filtersLoaded]);
  useEffect(() => {
    if (!filtersLoaded) return;
    try { localStorage.setItem("wc2026_group_filter", groupFilter); } catch {}
  }, [groupFilter, filtersLoaded]);
  useEffect(() => {
    if (!filtersLoaded) return;
    try { localStorage.setItem("wc2026_hide_resolved", hideResolved ? "1" : "0"); } catch {}
  }, [hideResolved, filtersLoaded]);
  useEffect(() => {
    if (!filtersLoaded) return;
    try { localStorage.setItem("wc2026_collapsed", JSON.stringify(collapsed)); } catch {}
  }, [collapsed, filtersLoaded]);

  // Poll server time every 30s and trigger lock warnings
  useEffect(() => {
    const fetchTime = async () => {
      const res = await fetch("/api/time");
      if (res.ok) {
        const data = await res.json();
        setNowMs(new Date(data.now).getTime());
      }
    };
    fetchTime();
    const interval = setInterval(fetchTime, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Fire lock warnings when virtual time enters the 60-min window before lock
  useEffect(() => {
    if (matches.length === 0) return;
    const newAlerts: typeof alerts = [];
    matches.forEach((m) => {
      if (m.status !== "SCHEDULED") return;
      if (warnedLocks.current.has(m.id)) return;
      const lockMs = new Date(m.kickoff).getTime() - 60 * 60 * 1000;
      const minutesToLock = Math.round((lockMs - nowMs) / 60_000);
      if (minutesToLock >= 0 && minutesToLock <= 60) {
        warnedLocks.current.add(m.id);
        newAlerts.push({
          id: `lock-${m.id}`,
          text: `${m.homeTeam} vs ${m.awayTeam} — predictions lock in ${minutesToLock}m`,
          type: "warn",
        });
      }
    });
    if (newAlerts.length > 0) setAlerts((a) => [...a, ...newAlerts]);
  }, [nowMs, matches]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll matches + predictions every 60s and surface scoring alerts
  useEffect(() => {
    if (!groupId) return;
    const poll = async () => {
      const [matchRes, predRes] = await Promise.all([
        fetch("/api/matches"),
        fetch(`/api/predictions?groupId=${groupId}`),
      ]);
      let freshPreds: Record<string, Prediction> = {};
      if (predRes.ok) {
        const predData: (Prediction & { matchId: string })[] = await predRes.json();
        predData.forEach((p) => (freshPreds[p.matchId] = p));
        setPredictions(freshPreds);
      }
      if (matchRes.ok) {
        const fresh: Match[] = await matchRes.json();
        fresh.forEach((m) => {
          const prev = prevStatuses.current[m.id];
          if (prev === "SCHEDULED" && m.status === "FINISHED") {
            const pred = freshPreds[m.id];
            const pts = pred?.points;
            const scoreStr = `${m.homeScore}–${m.awayScore}`;
            const ptsStr =
              pts != null ? (pts > 0 ? ` · +${pts}pts` : " · miss") : "";
            setAlerts((a) => [
              ...a,
              {
                id: `score-${m.id}`,
                text: `⚽ ${m.homeTeam} ${scoreStr} ${m.awayTeam}${ptsStr}`,
                type: "score",
              },
            ]);
          }
          prevStatuses.current[m.id] = m.status;
        });
        setMatches(fresh);
      }
    };
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.replace("/login"); return; }

    async function load() {
      setLoading(true);
      const [matchRes, predRes, groupRes] = await Promise.all([
        fetch("/api/matches"),
        fetch(`/api/predictions?groupId=${groupId}`),
        fetch(`/api/groups/${groupId}`),
      ]);
      const matchData: Match[] = await matchRes.json();
      matchData.forEach((m) => { prevStatuses.current[m.id] = m.status; });
      setMatches(matchData);

      if (predRes.ok) {
        const predData: Prediction[] = await predRes.json();
        const map: Record<string, Prediction> = {};
        predData.forEach((p) => (map[p.matchId] = p));
        setPredictions(map);
      }

      if (groupRes.ok) {
        const g = await groupRes.json();
        setGroupName(g.name ?? "");
        // Pull global Point Defaults to use as the per-stage baseline. Group's
        // explicit per-stage values overlay on top; legacy uniform 5/1 fills
        // are ignored so they don't mask the global defaults.
        const globalSettings = await fetch("/api/admin/settings")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const globalBase = loadStagePoints(globalSettings?.stagePoints);
        const isLegacy = isLegacyUniformFill(
          g.stagePoints,
          g.exactMatchPoints ?? 5,
          g.directionMatchPoints ?? 1,
        );
        const stagePoints = loadStagePoints(isLegacy ? "{}" : g.stagePoints, globalBase);
        setGroupSettings({
          exact: g.exactMatchPoints ?? 5,
          direction: g.directionMatchPoints ?? 1,
          stagePoints,
        });
        if (g.myMemberRole === "VISITOR_ADMIN") {
          router.replace(`/groups/${groupId}`);
          return;
        }
        if (!g.leaderboard && g.myStatus !== "APPROVED") {
          router.replace("/groups");
        }
      }
      setLoading(false);
    }
    load();
  }, [session, status, groupId, router]);

  const handleCancel = useCallback(
    async (matchId: string) => {
      const res = await fetch(`/api/predictions?matchId=${matchId}&groupId=${groupId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to withdraw");
      }
      setPredictions((prev) => {
        const next = { ...prev };
        delete next[matchId];
        return next;
      });
    },
    [groupId]
  );

  const handleSave = useCallback(
    async (matchId: string, homeScore: number, awayScore: number) => {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, groupId, homeScore, awayScore }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      const saved: Prediction = await res.json();
      setPredictions((prev) => ({ ...prev, [matchId]: saved }));
    },
    [groupId]
  );

  const showGeneral = roundFilter === "All" || roundFilter === "General";
  const showMatches = roundFilter !== "General";
  const showSidebar = !loading && (roundFilter === "All" || roundFilter === "Group Stage" || roundFilter === "General");

  const filtered = matches.filter((m) => {
    if (!showMatches) return false;
    if (roundFilter !== "All" && m.round !== roundFilter) return false;
    if (groupFilter !== "All" && m.group !== groupFilter) return false;
    if (hideResolved && m.homeScore !== null && m.awayScore !== null) return false;
    return true;
  });

  const grouped: Record<string, Match[]> = {};
  filtered.forEach((m) => {
    if (!grouped[m.round]) grouped[m.round] = [];
    grouped[m.round].push(m);
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/groups/${groupId}`} className="text-xs text-gray-400 hover:text-fifa-blue">
          ← Back to group
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold text-gray-900">All Matches</h1>
          {groupName && (
            <span className="bg-fifa-blue text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              {groupName}
            </span>
          )}
        </div>
        <p className="text-gray-400 text-sm mt-0.5">
          104 games · predictions count toward <strong className="text-gray-600">{groupName || "this group"}</strong> only
        </p>
        <div className="mt-3">
          <GroupSwitcher activeGroupId={groupId} subPage="matches" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-xs text-gray-500 mr-1">Round:</label>
          <select
            value={roundFilter}
            onChange={(e) => { setRoundFilter(e.target.value); setGroupFilter("All"); }}
            className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-fifa-blue"
          >
            {ROUNDS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        {(roundFilter === "All" || roundFilter === "Group Stage") && (
          <div>
            <label className="text-xs text-gray-500 mr-1">Group:</label>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            >
              {GROUPS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
        )}
        {showMatches && (
          <span className="text-xs text-gray-400">{filtered.length} matches</span>
        )}
        <button
          onClick={() => setHideResolved((v) => !v)}
          className={`ml-auto text-xs px-3 py-1.5 rounded-full border transition-colors ${
            hideResolved
              ? "bg-gray-800 text-white border-gray-800"
              : "border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700"
          }`}
        >
          {hideResolved ? "✓ Hiding resolved" : "Hide resolved"}
        </button>
      </div>

      {/* In-app notification alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-medium ${
                alert.type === "warn"
                  ? "bg-orange-50 border border-orange-200 text-orange-800"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-800"
              }`}
            >
              <span>{alert.type === "warn" ? "🔒" : "⚽"}</span>
              <span className="flex-1">{alert.text}</span>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="opacity-50 hover:opacity-100 transition text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading matches…</div>
      ) : (
        /* Two-column layout on large screens: matches left, standings sidebar right */
        <div className={showSidebar ? "lg:flex lg:gap-6 lg:items-start" : undefined}>

          {/* Main column */}
          <div className="min-w-0 flex-1 space-y-8">

            {/* General: custom predictions first */}
            {showGeneral && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    General
                  </h2>
                  <button
                    onClick={() => setCollapsed((prev) => ({ ...prev, General: !prev.General }))}
                    className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 rounded px-2 py-0.5 transition"
                  >
                    {collapsed.General ? "Show" : "Hide"}
                  </button>
                </div>
                {!collapsed.General && <CustomPredictionsPanel groupId={groupId} hideResolved={hideResolved} />}
              </div>
            )}

            {/* Match rounds */}
            {showMatches && ROUND_ORDER.filter((r) => grouped[r]).map((round) => {
              const isCollapsed = collapsed[round];
              const roundPts = groupSettings.stagePoints[round] ?? {
                exact: groupSettings.exact,
                direction: groupSettings.direction,
              };
              const toggleRound = () => setCollapsed((prev) => ({ ...prev, [round]: !prev[round] }));
              return (
                <div key={round}>
                  <button
                    type="button"
                    onClick={toggleRound}
                    aria-expanded={!isCollapsed}
                    className="w-full flex items-center justify-between mb-3 text-left group"
                  >
                    <div>
                      <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2 group-hover:text-fifa-blue transition">
                        <span className="w-2 h-2 rounded-full bg-fifa-blue inline-block" />
                        {round}
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5 ml-4">
                        Exact score: +{roundPts.exact} pts · Correct result: +{roundPts.direction} pt{roundPts.direction !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 group-hover:text-gray-600 border border-gray-200 group-hover:border-gray-300 rounded px-2 py-0.5 transition shrink-0">
                      {isCollapsed ? "Show" : "Hide"}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {grouped[round].map((match) => (
                        <MatchCard
                          key={match.id}
                          anchorId={`match-${match.id}`}
                          match={match}
                          prediction={predictions[match.id]}
                          onSave={session ? handleSave : undefined}
                          onCancel={session ? handleCancel : undefined}
                          isLoggedIn={!!session}
                          groupId={groupId}
                          nowMs={nowMs}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sidebar: standings — sidebar on desktop, collapsible section on mobile */}
          {showSidebar && (
            <div className="mt-8 lg:mt-0 lg:w-64 lg:shrink-0">
              <GroupStandingsPanel
                matches={matches}
                predictions={predictions}
                groupFilter={groupFilter}
                sidebar
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
