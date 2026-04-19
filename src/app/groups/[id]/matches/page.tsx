"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MatchCard } from "@/components/MatchCard";

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
        if (!g.leaderboard && g.myStatus !== "APPROVED") {
          router.replace("/groups");
        }
      }
      setLoading(false);
    }
    load();
  }, [session, status, groupId, router]);

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

  const filtered = matches.filter((m) => {
    if (roundFilter !== "All" && m.round !== roundFilter) return false;
    if (groupFilter !== "All" && m.group !== groupFilter) return false;
    return true;
  });

  const grouped: Record<string, Match[]> = {};
  filtered.forEach((m) => {
    if (!grouped[m.round]) grouped[m.round] = [];
    grouped[m.round].push(m);
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
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
        <span className="text-xs text-gray-400 self-end pb-1">{filtered.length} matches</span>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading matches…</div>
      ) : (
        <div className="space-y-8">
          {ROUND_ORDER.filter((r) => grouped[r]).map((round) => (
            <div key={round}>
              <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-fifa-blue inline-block" />
                {round}
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grouped[round].map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    prediction={predictions[match.id]}
                    onSave={session ? handleSave : undefined}
                    isLoggedIn={!!session}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
