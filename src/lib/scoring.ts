export const STAGES = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
] as const;

export type StagePoints = Partial<Record<string, { exact: number; direction: number }>>;

export function getPointsForRound(
  stagePoints: string | StagePoints,
  round: string,
  exactFallback: number,
  directionFallback: number
): { exact: number; direction: number } {
  const map: StagePoints = typeof stagePoints === "string"
    ? (JSON.parse(stagePoints || "{}") as StagePoints)
    : stagePoints;
  const s = map[round];
  return {
    exact: s?.exact ?? exactFallback,
    direction: s?.direction ?? directionFallback,
  };
}

interface ScoreResult {
  exact: boolean;
  direction: boolean;
  points: number;
}

export function calculatePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
  exactPoints: number,
  directionPoints: number
): ScoreResult {
  const exact = predictedHome === actualHome && predictedAway === actualAway;
  if (exact) return { exact: true, direction: true, points: exactPoints };

  const predictedOutcome = Math.sign(predictedHome - predictedAway);
  const actualOutcome = Math.sign(actualHome - actualAway);
  const direction = predictedOutcome === actualOutcome;
  if (direction) return { exact: false, direction: true, points: directionPoints };

  return { exact: false, direction: false, points: 0 };
}

import { getNowMs } from "@/lib/time";

export function isPredictionLocked(kickoff: Date): boolean {
  return getNowMs() >= kickoff.getTime() - 60 * 60 * 1000;
}
