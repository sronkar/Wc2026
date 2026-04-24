import { WC_GROUPS } from "@/lib/wcGroups";

export const POSITIVE_PICKS = ["WINNER", "RUNNER_UP", "THIRD"] as const;
export type PositivePick = typeof POSITIVE_PICKS[number];
export const ALL_PICKS = ["WINNER", "RUNNER_UP", "THIRD", "ELIMINATED"] as const;
export type ValidPick = typeof ALL_PICKS[number];

export interface ValidationResult {
  ok: boolean;
  status?: 422;
  error?: string;
}

/**
 * Validate a projected "team → pick" map against the tournament constraints:
 *   - At most 1 WINNER per WC group
 *   - At most 1 RUNNER_UP per WC group
 *   - At most 1 THIRD per WC group
 *   - At most 8 THIRDs globally (only 8 of 12 third-place finishers advance)
 *
 * ELIMINATED picks are unconstrained (effectively the default state).
 *
 * `projected` must be the user's full intended end-state for this prediction
 * group (existing picks + incoming changes merged). The caller is responsible
 * for that merging so constraints account for prior picks that aren't in the
 * current request.
 */
export function validateProjectedPicks(projected: Record<string, ValidPick>): ValidationResult {
  for (const [wcGroup, wcTeams] of Object.entries(WC_GROUPS)) {
    const winners   = wcTeams.filter((t) => projected[t] === "WINNER").length;
    const runnerUps = wcTeams.filter((t) => projected[t] === "RUNNER_UP").length;
    const thirds    = wcTeams.filter((t) => projected[t] === "THIRD").length;
    if (winners > 1)   return { ok: false, status: 422, error: `Group ${wcGroup}: only 1 winner allowed` };
    if (runnerUps > 1) return { ok: false, status: 422, error: `Group ${wcGroup}: only 1 runner-up allowed` };
    if (thirds > 1)    return { ok: false, status: 422, error: `Group ${wcGroup}: only 1 advance-as-3rd allowed` };
  }
  const totalThirds = Object.values(projected).filter((p) => p === "THIRD").length;
  if (totalThirds > 8) {
    return { ok: false, status: 422, error: "Maximum 8 teams can advance as 3rd-place" };
  }
  return { ok: true };
}
