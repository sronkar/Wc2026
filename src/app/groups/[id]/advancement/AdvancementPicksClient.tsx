"use client";

import { useState, useCallback } from "react";
import { getFlag } from "@/lib/flags";

type Pick = "WINNER" | "RUNNER_UP" | "THIRD";

const PICK_LABELS: Record<Pick, string> = {
  WINNER:    "1st",
  RUNNER_UP: "2nd",
  THIRD:     "3rd✓",
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
  // localPicks: what's shown in the UI (may differ from saved until "Save Group" is clicked)
  const [localPicks, setLocalPicks] = useState<Record<string, Pick | null>>(() => {
    const init: Record<string, Pick | null> = {};
    for (const [team, data] of Object.entries(initialPicks)) {
      if (data.pick === "WINNER" || data.pick === "RUNNER_UP" || data.pick === "THIRD") {
        init[team] = data.pick as Pick;
      }
    }
    return init;
  });

  // savedPicks: what's actually in the DB (used to detect unsaved changes)
  const [savedPicks, setSavedPicks] = useState<Record<string, Pick | null>>(() => {
    const init: Record<string, Pick | null> = {};
    for (const [team, data] of Object.entries(initialPicks)) {
      if (data.pick === "WINNER" || data.pick === "RUNNER_UP" || data.pick === "THIRD") {
        init[team] = data.pick as Pick;
      }
    }
    return init;
  });

  // Points per team (loaded after admin resolves)
  const [points, setPoints] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {};
    for (const [team, data] of Object.entries(initialPicks)) init[team] = data.points;
    return init;
  });

  const [saving, setSaving] = useState<Record<string, boolean>>({}); // keyed by WC group
  const [saved, setSaved] = useState<Record<string, boolean>>({});   // keyed by WC group
  const [errors, setErrors] = useState<Record<string, string>>({});  // keyed by WC group
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
    if (current === pick) return false; // toggle-off is always allowed

    const { winners, runnerUps, thirds } = getGroupCounts(wcGroup);
    if (pick === "WINNER"    && winners   >= 1) return true;
    if (pick === "RUNNER_UP" && runnerUps >= 1) return true;
    if (pick === "THIRD"     && thirds    >= 1) return true;
    if (pick === "THIRD"     && totalThirds >= 8) return true;
    return false;
  }, [localPicks, getGroupCounts, totalThirds, isLocked, isVisitor]);

  // Toggle a pick locally (no API call until "Save Group" is clicked)
  const handleToggle = useCallback((team: string, pick: Pick) => {
    if (isLocked || isVisitor) return;
    setLocalPicks((prev) => ({
      ...prev,
      [team]: prev[team] === pick ? null : pick,
    }));
  }, [isLocked, isVisitor]);

  const groupIsDirty = useCallback((wcGroup: string) => {
    const teams = wcGroups[wcGroup];
    return teams.some((t) => localPicks[t] !== savedPicks[t]);
  }, [localPicks, savedPicks, wcGroups]);

  // Save all picks for one WC group
  const handleSaveGroup = useCallback(async (wcGroup: string) => {
    const teams = wcGroups[wcGroup];
    const picks: Record<string, Pick | null> = {};
    for (const team of teams) picks[team] = localPicks[team] ?? null;

    setSaving((s) => ({ ...s, [wcGroup]: true }));
    setSaved((s) => ({ ...s, [wcGroup]: false }));
    setErrors((e) => ({ ...e, [wcGroup]: "" }));

    try {
      const res = await fetch("/api/advancement-predictions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, picks }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");

      // Commit local picks to saved state for this group
      setSavedPicks((prev) => {
        const next = { ...prev };
        for (const team of teams) next[team] = localPicks[team] ?? null;
        return next;
      });
      // Clear any old points for picks that were removed
      setPoints((prev) => {
        const next = { ...prev };
        for (const team of teams) {
          if (!localPicks[team]) next[team] = null;
        }
        return next;
      });

      setSaved((s) => ({ ...s, [wcGroup]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [wcGroup]: false })), 2500);
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, [wcGroup]: (err as Error).message ?? "Failed to save" }));
    } finally {
      setSaving((s) => ({ ...s, [wcGroup]: false }));
    }
  }, [wcGroups, groupId, localPicks]);

  const totalWinnerRunnerUp = Object.values(localPicks).filter(
    (p) => p === "WINNER" || p === "RUNNER_UP"
  ).length;
  const totalGroupCount = Object.keys(wcGroups).length; // 12
  const targetWinnerRunnerUp = totalGroupCount * 2; // 24

  // All 12 WC groups have at least 1 winner and 1 runner-up saved
  const advancementComplete = Object.entries(wcGroups).every(([, teams]) =>
    teams.some((t) => savedPicks[t] === "WINNER") && teams.some((t) => savedPicks[t] === "RUNNER_UP")
  );

  // Reset all picks for a WC group — immediately persists to server
  const handleResetGroup = useCallback(async (wcGroup: string) => {
    if (isLocked || isVisitor) return;
    const teams = wcGroups[wcGroup];

    // Optimistically clear local state
    setLocalPicks((prev) => {
      const next = { ...prev };
      for (const team of teams) next[team] = null;
      return next;
    });

    setSaving((s) => ({ ...s, [wcGroup]: true }));
    setErrors((e) => ({ ...e, [wcGroup]: "" }));
    try {
      const picks: Record<string, null> = {};
      for (const team of teams) picks[team] = null;
      const res = await fetch("/api/advancement-predictions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, picks }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to reset");
      // Commit cleared picks to saved state
      setSavedPicks((prev) => {
        const next = { ...prev };
        for (const team of teams) next[team] = null;
        return next;
      });
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, [wcGroup]: (err as Error).message ?? "Failed to reset" }));
      // Revert local state on error
      setSavedPicks((prev) => {
        setLocalPicks(prev); // restore from saved
        return prev;
      });
    } finally {
      setSaving((s) => ({ ...s, [wcGroup]: false }));
    }
  }, [wcGroups, isLocked, isVisitor, groupId]);

  // Reset all picks globally — immediately persists to server
  const handleResetAll = useCallback(async () => {
    if (isLocked || isVisitor || resetting) return;
    if (!window.confirm("Clear all your group stage picks? This cannot be undone.")) return;
    setResetting(true);
    setResetError("");
    try {
      // Build a null-pick payload for every team
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
      setSavedPicks({});
      setPoints({});
    } catch (err: unknown) {
      setResetError((err as Error).message ?? "Failed to reset");
    } finally {
      setResetting(false);
    }
  }, [isLocked, isVisitor, resetting, wcGroups, groupId]);

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
                title="Clear all picks — saves immediately"
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
            <strong>1st</strong> = group winner · <strong>2nd</strong> = runner-up · <strong>3rd✓</strong> = advances as best 3rd. Unselected = eliminated. Tap again to clear.
          </p>
        )}
      </div>

      {/* WC Group cards — 2-column on sm+, single column on mobile */}
      <div className="grid sm:grid-cols-2 gap-4">
        {Object.entries(wcGroups).sort(([a], [b]) => a.localeCompare(b)).map(([wcGroup, teams]) => {
          const { winners, runnerUps, thirds } = getGroupCounts(wcGroup);
          const dirty = groupIsDirty(wcGroup);
          const isSaving = saving[wcGroup];
          const isSaved = saved[wcGroup];
          const groupError = errors[wcGroup];

          return (
            <div key={wcGroup} className="card p-0 overflow-hidden">
              {/* Group header */}
              <div className="bg-fifa-blue text-white text-xs font-bold px-3 py-1.5 flex items-center justify-between">
                <span>Group {wcGroup}</span>
                <span className="font-normal opacity-75 text-[10px]">
                  {winners}/1 W · {runnerUps}/1 R · {thirds}/1 3rd
                </span>
              </div>

              {/* Teams */}
              <div className="divide-y divide-gray-50">
                {teams.map((team) => {
                  const currentPick = localPicks[team];
                  const teamPoints = points[team];
                  const resolved = resolvedMap[team];

                  return (
                    <div key={team} className="px-3 py-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base leading-none">{getFlag(team)}</span>
                        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{team}</span>
                        {resolved && (
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide shrink-0">
                            {resolved === "WINNER" ? "✓ 1st" : resolved === "RUNNER_UP" ? "✓ 2nd" : resolved === "THIRD" ? "✓ 3rd" : "✗ Out"}
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
                          const disabled = (!selected && isDisabled(wcGroup, team, pick)) || isSaving;
                          return (
                            <button
                              key={pick}
                              onClick={() => handleToggle(team, pick)}
                              disabled={disabled}
                              className={`flex-1 text-[10px] font-semibold py-1 rounded border transition ${
                                selected
                                  ? PICK_SELECTED[pick]
                                  : disabled
                                  ? "border-gray-100 text-gray-300 cursor-not-allowed"
                                  : `border-gray-200 text-gray-500 ${PICK_HOVER[pick]}`
                              }`}
                            >
                              {PICK_LABELS[pick]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Per-group save footer */}
              {!isLocked && !isVisitor && (
                <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-2">
                  <button
                    onClick={() => handleSaveGroup(wcGroup)}
                    disabled={isSaving || !dirty}
                    className={`text-xs font-semibold px-3 py-1 rounded-lg transition ${
                      dirty && !isSaving
                        ? "bg-fifa-blue text-white hover:bg-blue-700"
                        : isSaved
                        ? "bg-green-500 text-white"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {isSaving ? "Saving…" : isSaved ? "Saved ✓" : dirty ? "Save Group" : "No changes"}
                  </button>
                  <button
                    onClick={() => handleResetGroup(wcGroup)}
                    disabled={isSaving || teams.every((t) => !localPicks[t])}
                    className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-30 disabled:cursor-not-allowed ml-auto"
                    title="Clear all picks for this group"
                  >
                    Reset
                  </button>
                  {groupError && (
                    <span className="text-[10px] text-red-500">{groupError}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
