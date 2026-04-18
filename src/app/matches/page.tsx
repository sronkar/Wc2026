"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
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

export default function MatchesPage() {
  const { data: session } = useSession();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [loading, setLoading] = useState(true);
  const [roundFilter, setRoundFilter] = useState("All");
  const [groupFilter, setGroupFilter] = useState("All");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [matchRes, predRes] = await Promise.all([
        fetch("/api/matches"),
        session ? fetch("/api/predictions") : Promise.resolve(null),
      ]);
      const matchData: Match[] = await matchRes.json();
      setMatches(matchData);

      if (predRes) {
        const predData: Prediction[] = await predRes.json();
        const map: Record<string, Prediction> = {};
        predData.forEach((p) => (map[p.matchId] = p));
        setPredictions(map);
      }
      setLoading(false);
    }
    load();
  }, [session]);

  const handleSave = useCallback(
    async (matchId: string, homeScore: number, awayScore: number) => {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, homeScore, awayScore }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      const saved: Prediction = await res.json();
      setPredictions((prev) => ({ ...prev, [matchId]: saved }));
    },
    []
  );

  const filtered = matches.filter((m) => {
    if (roundFilter !== "All" && m.round !== roundFilter) return false;
    if (groupFilter !== "All" && m.group !== groupFilter) return false;
    return true;
  });

  const groupedByRound: Record<string, Match[]> = {};
  filtered.forEach((m) => {
    if (!groupedByRound[m.round]) groupedByRound[m.round] = [];
    groupedByRound[m.round].push(m);
  });

  const roundOrder = [
    "Group Stage",
    "Round of 32",
    "Round of 16",
    "Quarter-final",
    "Semi-final",
    "Third Place Play-off",
    "Final",
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">All Matches</h1>
      <p className="text-gray-400 text-sm mb-6">104 games · FIFA World Cup 2026</p>

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

      {!session && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm mb-6">
          <a href="/login" className="font-semibold hover:underline">Sign in</a> to submit your predictions.
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading matches...</div>
      ) : (
        <div className="space-y-8">
          {roundOrder
            .filter((r) => groupedByRound[r])
            .map((round) => (
              <div key={round}>
                <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-fifa-blue inline-block" />
                  {round}
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupedByRound[round].map((match) => (
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
