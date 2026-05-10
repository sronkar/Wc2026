"use client";

import { useState, useCallback, useRef } from "react";
import { getFlag } from "@/lib/flags";

type Pick = "WINNER" | "RUNNER_UP" | "THIRD";

const PICK_LABELS: Record<Pick, string> = {
  WINNER:    "1st",
  RUNNER_UP: "2nd",
  THIRD:     "Advance as 3rd",
};

const PICK_SELECTED: Record<Pick, string> = {
  WINNER:    "bg-green-600 text-white border-green-600",
  RUNNER_UP: "bg-blue-500 text-white border-blue-500",
  THIRD:     "bg-amber-500 text-white border-amber-500",
};

const PICK_HOVER: Record<Pick, string> = {
  WINNER:    "hover:bg-green-50 hover:border-green-400 hover:text-green-700",
  RUNNER_UP: "hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700",
  THIRD:     "hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700",
};

const ALL_PICKS: Pick[] = ["WINNER", "RUNNER_UP", "THIRD"];

interface Props {
  groupId: string;
  wcGroups: Record<string, string[]>;
  initialPicks: Record<string, { pick: string; points: number | null }>;
  resolvedMap: Record<string, string>;
  isLocked: boolean;
  isVisitor: boolean;
}

export function AdvancementPicksClient({
  groupId,
  wcGroups,
  initialPicks,
  resolvedMap,
  isLocked,
  isVisitor,
}: Props) {
  const [localPicks, setLocalPicks] = useState<Record<string, Pick | null>>(() => {
    const init: Record<string, Pick | null> = {};
    for (const [team, data] of Object.entries(initialPicks)) {
      if (data.pick === "WINNER" || data.pick === "RUNNER_UP" || data.pick === "THIRD") {
        init[team] = data.pick as Pick;
      }
    }
    return init;
  });

  const [points, setPoints] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {};
    for (const [team, data] of Object.entries(initialPicks)) init[team] = data.points;
    return init;
  });

  // Per-team saving state for optimistic UI
  const [savingTeam, setSavingTeam] = useState<Record<string, boolean>>({});
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  const totalThirds = Object.values(localPicks).filter((p) => p === "THIRD").length;

  const getGroupCounts = useCallback((wcGroup: string) => {
    const teams = wcGroups[wcGroup];
    return {
      winners:   teams.filter((t) => localPicks[t] === "WINNER").length,
      runnerUps: teams.filter((t) => localPicks[t] === "RUNNER_UP").length,
      thirds:    teams.filter((t) => localPicks[t] === "THIRD").length,
    };
  }, [localPicks, wcGroups]);

  const isDisabled = useCallback((wcGroup: string, team: string, pick: Pick): boolean => {
    if (isLocked || isVisitor) return true;
    const current = localPicks[team];
    if (current === pick) return false; // toggle-off always allowed

    const { winners, runnerUps, thirds } = getGroupCounts(wcGroup);
    if (pick === "WINNER"    && winners   >= 1) return true;
    if (pick === "RUNNER_UP" && runnerUps >= 1) return true;
    if (pick === "THIRD"     && thirds    >= 1) return true;
    if (pick === "THIRD"     && totalThirds >= 8) return true;
    return false;
  }, [localPicks, getGroupCounts, totalThirds, isLocked, isVisitor]);

  // Auto-save on every toggle (no Save button)
  const handleToggle = useCallback(async (team: string, pick: Pick) => {
    if (isLocked || isVisitor) return;
    const prevPick = localPicks[team] ?? null;
    const newPick: Pick | null = prevPick === pick ? null : pick;

    // Optimistic update
    setLocalPicks((prev: Record<string, Pick | null>) => ({ ...prev, [team]: newPick }));
    setSavingTeam((prev: Record<string, boolean>) => ({ ...prev, [team]: true }));

    try {
      const res = await fetch("/api/advancement-predictions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, picks: { [team]: newPick } }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      if (!newPick) setPoints((prev: Record<string, number | null>) => ({ ...prev, [team]: null }));
    } catch {
      // Revert on error
      setLocalPicks((prev: Record<string, Pick | null>) => ({ ...prev, [team]: prevPick }));
    } finally {
      setSavingTeam((prev: Record<string, boolean>) => ({ ...prev, [team]: false }));
    }
  }, [isLocked, isVisitor, localPicks, groupId]);

  // Reset all picks for one WC group — saves immediately
  const handleResetGroup = useCallback(async (wcGroup: string) => {
    if (isLocked || isVisitor) return;
    const teams = wcGroups[wcGroup];
    const prev: Record<string, Pick | null> = {};
    for (const t of teams) prev[t] = localPicks[t] ?? null;

    setLocalPicks((p: Record<string, Pick | null>) => { const n = { ...p }; for (const t of teams) n[t] = null; return n; });

    try {
      const picks: Record<string, null> = {};
      for (const t of teams) picks[t] = null;
      const res = await fetch("/api/advancement-predictions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, picks }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to reset");
      setPoints((p: Record<string, number | null>) => { const n = { ...p }; for (const t of teams) n[t] = null; return n; });
    } catch {
      setLocalPicks((p: Record<string, Pick | null>) => ({ ...p, ...prev })); // revert
    }
  }, [wcGroups, isLocked, isVisitor, groupId, localPicks]);

  // Reset all picks globally
  const handleResetAll = useCallback(async () => {
    if (isLocked || isVisitor || resetting) return;
    if (!window.confirm("Clear all your group stage picks? This cannot be undone.")) return;
    setResetting(true);
    setResetError("");
    try {
      const allPicks: Record<string, null> = {};
      for (const teams of Object.values(wcGroups)) {
        for (const team of teams) allPicks[team] = null;
      }
      const res = await fetch("/api/advancement-predictions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, picks: allPicks }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to reset");
      setLocalPicks({});
      setPoints({});
    } catch (err: unknown) {
      setResetError((err as Error).message ?? "Failed to reset");
    } finally {
      setResetting(false);
    }
  }, [isLocked, isVisitor, resetting, wcGroups, groupId]);

  const totalWinnerRunnerUp = Object.values(localPicks).filter(
    (p) => p === "WINNER" || p === "RUNNER_UP"
  ).length;
  const totalGroupCount = Object.keys(wcGroups).length;
  const targetWinnerRunnerUp = totalGroupCount * 2;

  const advancementComplete =
    totalThirds === 8 &&
    Object.entries(wcGroups).every(([, teams]) =>
      teams.some((t) => localPicks[t] === "WINNER") && teams.some((t) => localPicks[t] === "RUNNER_UP")
    );

  // Scroll-vs-tap guard: ignore click if pointer moved significantly from touchstart
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const didScroll = useCallback((clickX: number, clickY: number) => {
    if (!pointerDownPos.current) return false;
    const dx = Math.abs(clickX - pointerDownPos.current.x);
    const dy = Math.abs(clickY - pointerDownPos.current.y);
    return dx > 8 || dy > 8;
  }, []);

  return (
    <div className="space-y-4">
      {/* Global progress */}
      <div className="card">
        <div className="flex flex-wrap gap-5 text-sm items-center justify-between">
          <div className="flex flex-wrap gap-5 items-center">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-extrabold tabular-nums ${totalWinnerRunnerUp === targetWinnerRunnerUp ? "text-green-600" : totalWinnerRunnerUp > targetWinnerRunnerUp ? "text-red-600" : "text-gray-700"}`}>
                {totalWinnerRunnerUp}
                <span className="text-sm font-semibold text-gray-400">/{targetWinnerRunnerUp}</span>
              </span>
              <span className="text-xs text-gray-400">winners + runners-up</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-xl font-extrabold tabular-nums ${totalThirds === 8 ? "text-amber-600" : totalThirds > 8 ? "text-red-600" : "text-gray-700"}`}>
                {totalThirds}
                <span className="text-sm font-semibold text-gray-400">/8</span>
              </span>
              <span className="text-xs text-gray-400">
                advance 3rd{!isLocked && !isVisitor && totalThirds < 8 ? ` · ${8 - totalThirds} remaining` : ""}
              </span>
            </div>
            {advancementComplete && (
              <span className="text-green-600 font-semibold text-sm flex items-center gap-1">✓ All complete</span>
            )}
          </div>
          {!isLocked && !isVisitor && Object.values(localPicks).some(Boolean) && (
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <button
                onClick={handleResetAll}
                disabled={resetting}
                className="text-xs text-red-400 hover:text-red-600 transition font-medium disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Reset All"}
              </button>
              {resetError && <span className="text-[10px] text-red-500">{resetError}</span>}
            </div>
          )}
        </div>
        {isVisitor && !isLocked && (
          <p className="text-xs text-gray-400 mt-2">Visitor Admins cannot submit predictions.</p>
        )}
        {!isLocked && !isVisitor && (
          <p className="text-xs text-gray-400 mt-2">
            <strong>Advance as 3rd</strong> = one of the 8 best 3rd-place finishers that advance. Tap again to clear.
          </p>
        )}
      </div>

      {/* WC Group cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {Object.entries(wcGroups).sort(([a], [b]) => a.localeCompare(b)).map(([wcGroup, teams]) => {
          const { winners, runnerUps, thirds } = getGroupCounts(wcGroup);

          return (
            <div key={wcGroup} className="card p-0">
              {/* Group header */}
              <div className="bg-fifa-blue text-white text-xs font-bold px-3 py-1.5 flex items-center justify-between rounded-t-xl">
                <span>Group {wcGroup}</span>
                <span className="font-normal opacity-75 text-[10px]">
                  {winners}/1 W · {runnerUps}/1 R{thirds > 0 ? " · 3rd ✓" : ""}
                </span>
              </div>

              {/* Teams */}
              <div className="divide-y divide-gray-50">
                {teams.map((team) => {
                  const currentPick = localPicks[team];
                  const teamPoints = points[team];
                  const resolved = resolvedMap[team];
                  const teamSaving = savingTeam[team];

                  return (
                    <div key={team} className="px-3 py-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base leading-none">{getFlag(team)}</span>
                        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{team}</span>
                        {resolved && (
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide shrink-0">
                            {resolved === "WINNER" ? "✓ 1st" : resolved === "RUNNER_UP" ? "✓ 2nd" : resolved === "THIRD" ? "✓ Adv. as 3rd" : "✗ Out"}
                          </span>
                        )}
                        {teamPoints !== null && teamPoints !== undefined && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            teamPoints > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                          }`}>
                            {teamPoints > 0 ? `+${teamPoints}` : "0"} pts
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {ALL_PICKS.map((pick) => {
                          const selected = currentPick === pick;
                          const disabled = (!selected && isDisabled(wcGroup, team, pick)) || teamSaving;
                          return (
                            <div key={pick} className={`relative flex-1 ${pick === "THIRD" ? "group/pick" : ""}`}>
                              <button
                                onPointerDown={(e) => { pointerDownPos.current = { x: e.clientX, y: e.clientY }; }}
                                onClick={(e) => {
                                  if (didScroll(e.clientX, e.clientY)) return;
                                  handleToggle(team, pick);
                                }}
                                disabled={disabled}
                                className={`w-full text-[10px] font-semibold py-1 rounded border transition whitespace-nowrap ${
                                  selected
                                    ? PICK_SELECTED[pick]
                                    : disabled
                                    ? "border-gray-100 text-gray-300 cursor-not-allowed"
                                    : `border-gray-200 text-gray-500 ${PICK_HOVER[pick]}`
                                }`}
                              >
                                {teamSaving && selected ? "…" : PICK_LABELS[pick]}
                              </button>
                              {pick === "THIRD" && (
                                <div
                                  role="tooltip"
                                  className="absolute bottom-full right-0 mb-1 hidden group-hover/pick:block z-20 max-w-[10rem] bg-gray-900 text-white text-[10px] font-normal rounded px-2 py-1 shadow-lg pointer-events-none text-center leading-snug"
                                >
                                  Best 8 3rd-place finishers advance
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-group reset footer */}
              {!isLocked && !isVisitor && (
                <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-end">
                  <button
                    onClick={() => handleResetGroup(wcGroup)}
                    disabled={teams.every((t) => !localPicks[t])}
                    className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
