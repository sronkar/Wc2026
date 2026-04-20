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

function computeTop8ThirdPlace(standings: Record<string, Row[]>): Set<string> {
  const thirds: (Row & { group: string })[] = Object.entries(standings)
    .filter(([, rows]) => rows.length >= 3)
    .map(([group, rows]) => ({ ...rows[2], group }));

  thirds.sort((a, b) => {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    if (b.GD !== a.GD) return b.GD - a.GD;
    if (b.GF !== a.GF) return b.GF - a.GF;
    return a.team.localeCompare(b.team);
  });

  return new Set(thirds.slice(0, 8).map((r) => r.team));
}

function computeThirdPlaceRanking(standings: Record<string, Row[]>): (Row & { group: string })[] {
  const thirds: (Row & { group: string })[] = Object.entries(standings)
    .filter(([, rows]) => rows.length >= 3)
    .map(([group, rows]) => ({ ...rows[2], group }));

  thirds.sort((a, b) => {
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;
    if (b.GD !== a.GD) return b.GD - a.GD;
    if (b.GF !== a.GF) return b.GF - a.GF;
    return a.team.localeCompare(b.team);
  });

  return thirds;
}

function GroupTable({
  name,
  rows,
  top8ThirdPlace,
}: {
  name: string;
  rows: Row[];
  top8ThirdPlace: Set<string>;
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="bg-fifa-blue text-white text-xs font-bold px-3 py-1.5">Group {name}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400">
            <th className="text-left px-3 py-1.5 font-medium w-full">Team</th>
            <th className="px-1 py-1.5 font-medium text-center">W</th>
            <th className="px-1 py-1.5 font-medium text-center">D</th>
            <th className="px-1 py-1.5 font-medium text-center">L</th>
            <th className="px-1 py-1.5 font-medium text-center">GD</th>
            <th className="px-1 py-1.5 font-medium text-center">GF</th>
            <th className="px-2 py-1.5 font-medium text-center text-fifa-blue">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isTop2 = i < 2;
            const isQualifiedThird = i === 2 && top8ThirdPlace.has(row.team);
            const rowBg = isTop2
              ? "bg-green-50"
              : isQualifiedThird
              ? "bg-amber-50"
              : "";
            return (
              <tr key={row.team} className={`border-b border-gray-50 last:border-0 ${rowBg}`}>
                <td className="px-2 py-1.5 max-w-0 w-full">
                  <div className="flex items-center gap-1">
                    <span className="text-sm leading-none shrink-0">{getFlag(row.team)}</span>
                    <span
                      className={`truncate text-[11px] leading-tight ${
                        isTop2 ? "font-semibold text-gray-800" : isQualifiedThird ? "font-semibold text-amber-800" : "text-gray-600"
                      }`}
                    >
                      {row.team}
                    </span>
                  </div>
                </td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.W}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.D}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.L}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.GD > 0 ? `+${row.GD}` : row.GD}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.GF}</td>
                <td className="px-2 py-1.5 text-center font-bold text-fifa-blue">{row.Pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ThirdPlaceRanking({ ranking }: { ranking: (Row & { group: string })[] }) {
  if (ranking.length === 0) return null;
  return (
    <div className="card p-0 overflow-hidden">
      <div className="bg-amber-500 text-white text-xs font-bold px-3 py-1.5">
        3rd Place Teams Ranking
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400">
            <th className="px-2 py-1.5 font-medium text-center">#</th>
            <th className="text-left px-3 py-1.5 font-medium w-full">Team</th>
            <th className="px-1 py-1.5 font-medium text-center">Grp</th>
            <th className="px-1 py-1.5 font-medium text-center">W</th>
            <th className="px-1 py-1.5 font-medium text-center">D</th>
            <th className="px-1 py-1.5 font-medium text-center">L</th>
            <th className="px-1 py-1.5 font-medium text-center">GD</th>
            <th className="px-1 py-1.5 font-medium text-center">GF</th>
            <th className="px-2 py-1.5 font-medium text-center text-fifa-blue">P</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((row, i) => {
            const qualified = i < 8;
            const rowBg = qualified ? "bg-amber-50" : "";
            return (
              <tr key={row.team} className={`border-b border-gray-50 last:border-0 ${rowBg}`}>
                <td className="px-2 py-1.5 text-center text-gray-400 font-medium">{i + 1}</td>
                <td className="px-2 py-1.5 max-w-0 w-full">
                  <div className="flex items-center gap-1">
                    <span className="text-sm leading-none shrink-0">{getFlag(row.team)}</span>
                    <span
                      className={`truncate text-[11px] leading-tight ${
                        qualified ? "font-semibold text-amber-800" : "text-gray-600"
                      }`}
                    >
                      {row.team}
                    </span>
                  </div>
                </td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.group}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.W}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.D}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.L}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.GD > 0 ? `+${row.GD}` : row.GD}</td>
                <td className="px-1 py-1.5 text-center text-gray-500">{row.GF}</td>
                <td className="px-2 py-1.5 text-center font-bold text-fifa-blue">{row.Pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
        Top 8 advance to Round of 32
      </div>
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

  const top8ThirdPlace = computeTop8ThirdPlace(standings);
  const thirdPlaceRanking = computeThirdPlaceRanking(standings);

  const visible = groupFilter !== "All"
    ? groupNames.filter((g) => g === groupFilter)
    : groupNames;

  if (visible.length === 0) return null;

  const showThirdPlace = groupFilter === "All";

  if (sidebar) {
    return (
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Standings
        </h2>
        {visible.map((g) => (
          <GroupTable key={g} name={g} rows={standings[g]} top8ThirdPlace={top8ThirdPlace} />
        ))}
        {showThirdPlace && <ThirdPlaceRanking ranking={thirdPlaceRanking} />}
        <div className="text-xs text-gray-400 space-y-0.5">
          <p>
            <span className="inline-block w-2 h-2 rounded-sm bg-green-100 border border-green-300 mr-1" />
            Top 2 advance
          </p>
          <p>
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-100 border border-amber-300 mr-1" />
            Best 8 third-place advance
          </p>
        </div>
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
          <GroupTable key={g} name={g} rows={standings[g]} top8ThirdPlace={top8ThirdPlace} />
        ))}
      </div>
      {showThirdPlace && (
        <div className="mt-4">
          <ThirdPlaceRanking ranking={thirdPlaceRanking} />
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2 space-x-3">
        <span>
          <span className="inline-block w-2 h-2 rounded-sm bg-green-100 border border-green-300 mr-1" />
          Top 2 advance
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-sm bg-amber-100 border border-amber-300 mr-1" />
          Best 8 third-place advance
        </span>
      </p>
    </div>
  );
}
