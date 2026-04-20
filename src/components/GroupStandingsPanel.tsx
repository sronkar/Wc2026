"use client";

import { getFlag } from "@/lib/flags";

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  group: string | null;
  round: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface Prediction {
  matchId: string;
  homeScore: number;
  awayScore: number;
}

interface Row {
  team: string;
  P: number; W: number; D: number; L: number;
  GF: number; GA: number; GD: number; Pts: number;
}

function computeStandings(
  matches: Match[],
  predictions: Record<string, Prediction>
): Record<string, Row[]> {
  const groups: Record<string, Record<string, Row>> = {};

  for (const m of matches) {
    if (m.round !== "Group Stage" || !m.group) continue;
    const g = m.group;
    if (!groups[g]) groups[g] = {};
    for (const team of [m.homeTeam, m.awayTeam]) {
      if (!groups[g][team]) {
        groups[g][team] = { team, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
      }
    }

    let home: number | null = null;
    let away: number | null = null;

    if (m.homeScore !== null && m.awayScore !== null) {
      home = m.homeScore;
      away = m.awayScore;
    } else {
      const pred = predictions[m.id];
      if (pred !== undefined) {
        home = pred.homeScore;
        away = pred.awayScore;
      }
    }

    if (home === null || away === null) continue;

    const h = groups[g][m.homeTeam];
    const a = groups[g][m.awayTeam];

    h.P++; a.P++;
    h.GF += home; h.GA += away;
    a.GF += away; a.GA += home;
    h.GD = h.GF - h.GA;
    a.GD = a.GF - a.GA;

    if (home > away) {
      h.W++; h.Pts += 3; a.L++;
    } else if (home === away) {
      h.D++; h.Pts += 1; a.D++; a.Pts += 1;
    } else {
      a.W++; a.Pts += 3; h.L++;
    }
  }

  const result: Record<string, Row[]> = {};
  for (const [g, teams] of Object.entries(groups)) {
    result[g] = Object.values(teams).sort((a, b) => {
      if (b.Pts !== a.Pts) return b.Pts - a.Pts;
      if (b.GD !== a.GD) return b.GD - a.GD;
      if (b.GF !== a.GF) return b.GF - a.GF;
      return a.team.localeCompare(b.team);
    });
  }
  return result;
}

function GroupTable({ name, rows }: { name: string; rows: Row[] }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="bg-fifa-blue text-white text-xs font-bold px-3 py-1.5">Group {name}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400">
            <th className="text-left px-3 py-1.5 font-medium w-full">Team</th>
            <th className="px-1 py-1.5 font-medium text-center">P</th>
            <th className="px-1 py-1.5 font-medium text-center">W</th>
            <th className="px-1 py-1.5 font-medium text-center">D</th>
            <th className="px-1 py-1.5 font-medium text-center">L</th>
            <th className="px-1 py-1.5 font-medium text-center">GD</th>
            <th className="px-2 py-1.5 font-medium text-center text-fifa-blue">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.team} className={`border-b border-gray-50 last:border-0 ${i < 2 ? "bg-green-50" : ""}`}>
              <td className="px-2 py-1.5 max-w-0 w-full">
                <div className="flex items-center gap-1">
                  <span className="text-sm leading-none shrink-0">{getFlag(row.team)}</span>
                  <span className={`truncate text-[11px] leading-tight ${i < 2 ? "font-semibold text-gray-800" : "text-gray-600"}`}>{row.team}</span>
                </div>
              </td>
              <td className="px-1 py-1.5 text-center text-gray-500">{row.P}</td>
              <td className="px-1 py-1.5 text-center text-gray-500">{row.W}</td>
              <td className="px-1 py-1.5 text-center text-gray-500">{row.D}</td>
              <td className="px-1 py-1.5 text-center text-gray-500">{row.L}</td>
              <td className="px-1 py-1.5 text-center text-gray-500">{row.GD > 0 ? `+${row.GD}` : row.GD}</td>
              <td className="px-2 py-1.5 text-center font-bold text-fifa-blue">{row.Pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GroupStandingsPanel({
  matches,
  predictions,
  groupFilter,
  sidebar = false,
}: {
  matches: Match[];
  predictions: Record<string, Prediction>;
  groupFilter: string;
  sidebar?: boolean;
}) {
  const standings = computeStandings(matches, predictions);
  const groupNames = Object.keys(standings).sort();
  if (groupNames.length === 0) return null;

  const visible = groupFilter !== "All"
    ? groupNames.filter((g) => g === groupFilter)
    : groupNames;

  if (visible.length === 0) return null;

  if (sidebar) {
    return (
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Standings
        </h2>
        {visible.map((g) => (
          <GroupTable key={g} name={g} rows={standings[g]} />
        ))}
        <p className="text-xs text-gray-400">
          <span className="inline-block w-2 h-2 rounded-sm bg-green-100 border border-green-300 mr-1" />
          Top 2 advance
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h2 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        Group Stage Standings
        <span className="text-xs font-normal text-gray-400">(based on your predictions)</span>
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {visible.map((g) => (
          <GroupTable key={g} name={g} rows={standings[g]} />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        <span className="inline-block w-2 h-2 rounded-sm bg-green-100 border border-green-300 mr-1" />
        Top 2 advance · standings reflect your predicted scores
      </p>
    </div>
  );
}
