// Shared between the global Point Defaults UI, per-group settings UI, and the
// group-creation API. Single source of truth for stage names + default values.

export const STAGES = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
] as const;

export type StageName = typeof STAGES[number];
export type StagePointsMap = Record<StageName, { exact: number; direction: number }>;

export function defaultStagePoints(): StagePointsMap {
  return {
    "Group Stage":          { exact: 2, direction: 1 },
    "Round of 32":          { exact: 3, direction: 2 },
    "Round of 16":          { exact: 4, direction: 2 },
    "Quarter-final":        { exact: 8, direction: 4 },
    "Semi-final":           { exact: 10, direction: 5 },
    "Third Place Play-off": { exact: 10, direction: 5 },
    "Final":                { exact: 12, direction: 6 },
  };
}

// Advancement scoring is independent of the stage matrix above (it scores
// group-stage placements, not match outcomes).
export const DEFAULT_ADVANCEMENT_POINTS = { exact: 2, direction: 1 };

// Parse stored JSON (or "{}") and fill any missing stage with the per-stage
// defaults — never with the legacy flat single-value fallback.
//
// Optionally pass `baseDefaults` (e.g. parsed global PointSettings.stagePoints)
// to use as the per-stage baseline instead of the static suggested set.
export function loadStagePoints(
  stored: string | null | undefined,
  baseDefaults?: StagePointsMap,
): StagePointsMap {
  const result: StagePointsMap = baseDefaults
    ? { ...baseDefaults }
    : defaultStagePoints();
  if (!stored) return result;
  try {
    const parsed = JSON.parse(stored) as Partial<Record<string, { exact: number; direction: number }>>;
    for (const stage of STAGES) {
      const s = parsed[stage];
      if (s && typeof s.exact === "number" && typeof s.direction === "number") {
        result[stage] = { exact: s.exact, direction: s.direction };
      }
    }
    return result;
  } catch {
    return result;
  }
}

// Detects the legacy "uniform fill" pattern: every stage stored as the same
// flat exact/direction values (the pre-per-stage code wrote this). Such groups
// should be treated as "not customised" so global defaults flow through.
export function isLegacyUniformFill(
  stored: string | null | undefined,
  flatExact: number,
  flatDirection: number,
): boolean {
  if (!stored || stored === "{}") return false;
  try {
    const parsed = JSON.parse(stored) as Partial<Record<string, { exact: number; direction: number }>>;
    for (const stage of STAGES) {
      const s = parsed[stage];
      if (!s || s.exact !== flatExact || s.direction !== flatDirection) return false;
    }
    return true;
  } catch {
    return false;
  }
}
