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

export function isPredictionLocked(kickoff: Date): boolean {
  return Date.now() >= kickoff.getTime() - 60 * 60 * 1000;
}
