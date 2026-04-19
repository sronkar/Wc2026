"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface LockedMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  status: string;
}

interface PredictionEntry {
  userId: string;
  userName: string;
  userImage: string | null;
  homeScore: number;
  awayScore: number;
  points: number | null;
  isCurrentUser: boolean;
}

interface Props {
  groupId: string;
  lockedMatch: LockedMatch | null;
}

function formatCountdown(kickoff: Date): string {
  const diff = kickoff.getTime() - Date.now();
  if (diff <= 0) return "Started";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function LockedPredictionsPanel({ groupId, lockedMatch }: Props) {
  const [entries, setEntries] = useState<PredictionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!lockedMatch) return;
    setLoading(true);
    fetch(`/api/matches/${lockedMatch.id}/predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data) => {
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [lockedMatch]);

  useEffect(() => {
    if (!lockedMatch) return;
    const kickoff = new Date(lockedMatch.kickoff);
    const tick = () => setCountdown(formatCountdown(kickoff));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [lockedMatch]);

  if (!lockedMatch) return null;

  const finished = lockedMatch.status === "FINISHED";
  const kickoff = new Date(lockedMatch.kickoff);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-bold text-gray-800">
            Everyone&apos;s Picks
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {lockedMatch.homeTeam} vs {lockedMatch.awayTeam}
          </p>
        </div>
        <div className="text-right">
          {finished ? (
            <span className="badge bg-green-100 text-green-700">Finished</span>
          ) : (
            <div>
              <span className="badge bg-orange-100 text-orange-700">🔒 Locked</span>
              {countdown && (
                <p className="text-xs text-gray-400 mt-1">Kickoff in {countdown}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-4 text-sm">Loading picks…</div>
      ) : entries.length === 0 ? (
        <div className="text-center text-gray-400 py-4 text-sm">No predictions submitted.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {entries.map((e) => (
            <div
              key={e.userId}
              className={`rounded-lg p-3 flex flex-col items-center gap-1 ${
                e.isCurrentUser
                  ? "bg-blue-50 ring-1 ring-fifa-blue"
                  : "bg-gray-50"
              }`}
            >
              {e.userImage ? (
                <Image src={e.userImage} alt={e.userName} width={32} height={32} className="rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-fifa-blue text-white text-xs font-bold flex items-center justify-center">
                  {e.userName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-medium text-gray-700 truncate max-w-full">
                {e.isCurrentUser ? "You" : e.userName}
              </span>
              <span className="text-base font-extrabold text-gray-800 tabular-nums">
                {e.homeScore} – {e.awayScore}
              </span>
              {finished && e.points !== null && (
                <span className={`badge text-xs ${
                  e.points >= 5 ? "bg-green-100 text-green-700" :
                  e.points > 0 ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-400"
                }`}>
                  {e.points > 0 ? `+${e.points} pts` : "0 pts"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3 text-center">
        Predictions are revealed once locked (1 hour before kickoff)
      </p>
    </div>
  );
}
