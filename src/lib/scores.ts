import { prisma } from "@/lib/prisma";
import { calculatePoints, getPointsForRound } from "@/lib/scoring";
import { sendPostGameNotifications } from "@/lib/notifications";
import { generateResultNotification } from "@/lib/userNotifications";
import { getNow } from "@/lib/time";
import { recordScorePollSuccess, recordScorePollFailure } from "@/lib/scoreHealth";

// ── Team name normalisation ───────────────────────────────────────────────────
// Maps external API names → names stored in our DB
const ALIASES: Record<string, string> = {
  "USA":                                  "United States",
  "US":                                   "United States",
  "Côte d'Ivoire":                        "Ivory Coast",
  "Cote d'Ivoire":                        "Ivory Coast",
  "Congo DR":                             "DR Congo",
  "Democratic Republic of the Congo":     "DR Congo",
  "Congo, DR":                            "DR Congo",
  "Bosnia and Herzegovina":               "Bosnia-Herzegovina",
  "Bosnia & Herzegovina":                 "Bosnia-Herzegovina",
  "Bosnia":                               "Bosnia-Herzegovina",
  "Czech Republic":                       "Czechia",
  "Czechia":                              "Czechia",
  "Korea Republic":                       "South Korea",
  "Republic of Korea":                    "South Korea",
  "South Korea":                          "South Korea",
  "IR Iran":                              "Iran",
  "Islamic Republic of Iran":             "Iran",
  "Cape Verde Islands":                   "Cape Verde",
  "Curacao":                              "Curaçao",
  "New Caledonia":                        "New Zealand",
};

function norm(name: string): string {
  return (ALIASES[name] ?? name).toLowerCase().trim();
}

interface ExternalResult {
  homeTeam: string; // normalised
  awayTeam: string; // normalised
  homeScore: number;
  awayScore: number;
  kickoff: Date;
}

// ── Source 1: football-data.org (free API key at football-data.org) ───────────
async function fetchFromFootballData(): Promise<ExternalResult[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      "https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED",
      {
        headers: { "X-Auth-Token": key },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      console.warn(`[scores] football-data.org responded ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.matches ?? [])
      .filter(
        (m: any) =>
          m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null
      )
      .map((m: any) => ({
        homeTeam: norm(m.homeTeam.name),
        awayTeam: norm(m.awayTeam.name),
        homeScore: m.score.fullTime.home as number,
        awayScore: m.score.fullTime.away as number,
        kickoff: new Date(m.utcDate),
      }));
  } catch (e) {
    console.warn("[scores] football-data.org fetch error:", e);
    return [];
  }
}

// ── Source 2: ESPN unofficial scoreboard (no key required) ───────────────────
async function fetchFromESPN(yyyymmdd: string): Promise<ExternalResult[]> {
  // ESPN league slug for FIFA World Cup
  const slugs = ["fifa.world", "worldcup"];
  for (const slug of slugs) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${yyyymmdd}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      const data = await res.json();
      const results: ExternalResult[] = [];
      for (const event of data.events ?? []) {
        if (event.status?.type?.name !== "STATUS_FINAL") continue;
        const comp = event.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
        const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
        if (!home || !away) continue;
        const hs = parseInt(home.score, 10);
        const as_ = parseInt(away.score, 10);
        if (isNaN(hs) || isNaN(as_)) continue;
        results.push({
          homeTeam: norm(home.team.displayName),
          awayTeam: norm(away.team.displayName),
          homeScore: hs,
          awayScore: as_,
          kickoff: new Date(event.date),
        });
      }
      if (results.length > 0) return results;
    } catch { /* try next slug */ }
  }
  return [];
}

function toYYYYMMDD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// ── Shared core: update DB + recalculate + notify ────────────────────────────

export async function applyMatchResult(
  matchId: string,
  homeScore: number,
  awayScore: number
) {
  // ── Atomic phase: all DB writes for this match happen in a single transaction.
  // If anything throws inside, the match stays SCHEDULED and no predictions are
  // partially scored. The caller can safely retry.
  //
  // Notifications are intentionally collected here and sent AFTER the commit
  // so that a push/email failure can't roll back the score.
  const toNotify: Array<{
    userId: string;
    points: number;
    exact: boolean;
  }> = [];

  const match = await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: matchId },
      data: { homeScore, awayScore, status: "FINISHED" },
    });

    const predictions = await tx.prediction.findMany({
      where: { matchId },
      include: { group: { select: { exactMatchPoints: true, directionMatchPoints: true, stagePoints: true } } },
    });

    const m = await tx.match.findUnique({
      where: { id: matchId },
      select: { round: true, homeTeam: true, awayTeam: true },
    });
    const round = m?.round ?? "";

    const notified = new Set<string>();
    for (const pred of predictions) {
      const { exact: exactPts, direction: dirPts } = getPointsForRound(
        pred.group.stagePoints, round, pred.group.exactMatchPoints, pred.group.directionMatchPoints
      );
      const { points, exact } = calculatePoints(
        pred.homeScore, pred.awayScore, homeScore, awayScore, exactPts, dirPts
      );
      await tx.prediction.update({ where: { id: pred.id }, data: { points } });

      // One result notification per user per match (across groups)
      if (!notified.has(pred.userId)) {
        notified.add(pred.userId);
        toNotify.push({ userId: pred.userId, points, exact });
      }
    }

    return m;
  }, { timeout: 30_000 });

  if (!match) return;

  // ── Post-commit side-effects (fire and forget, failures don't roll back scoring)
  for (const n of toNotify) {
    generateResultNotification(
      n.userId, matchId,
      match.homeTeam, match.awayTeam,
      homeScore, awayScore, n.points, n.exact
    ).catch(() => {});
  }

  const settings = await prisma.pointSettings.findUnique({ where: { id: "default" } });
  const exactPts = settings?.exactMatchPoints ?? 2;
  const directionPts = settings?.directionMatchPoints ?? 1;
  sendPostGameNotifications(matchId, homeScore, awayScore, exactPts, directionPts).catch(
    (e) => console.error("[notifications] post-game send failed:", e)
  );
}

// ── Cron-called polling function ─────────────────────────────────────────────

export interface PollResult {
  checked: number;
  updated: number;
  matches: { matchNumber: number; home: string; away: string; score: string }[];
  source: string | null;
  error?: string;
}

export async function pollAndUpdateScores(): Promise<PollResult> {
  const now = getNow();
  const cutoff = new Date(now.getTime() - 105 * 60 * 1000); // 1h 45m ago
  const ceiling = new Date(now.getTime() - 8 * 60 * 60 * 1000); // 8h ago (don't re-check very old)

  const pending = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      kickoff: { lte: cutoff, gte: ceiling },
    },
    orderBy: { kickoff: "asc" },
  });

  if (pending.length === 0) return { checked: 0, updated: 0, matches: [], source: null };

  // Collect unique date strings needed
  const uniqueDates = Array.from(new Set(pending.map((m) => toYYYYMMDD(m.kickoff))));

  // Try primary source
  let external = await fetchFromFootballData();
  let source = external.length > 0 ? "football-data.org" : null;

  // Fallback to ESPN per date
  if (external.length === 0) {
    const espnBatches = await Promise.all(uniqueDates.map((d) => fetchFromESPN(d)));
    external = espnBatches.flat();
    if (external.length > 0) source = "ESPN";
  }

  if (external.length === 0) {
    console.log(`[scores] polled ${pending.length} match(es) — no external data yet`);
    // Treat "pending matches exist but neither API returned any data" as a failure.
    // Sim mode is suppressed inside recordScorePollFailure so sim ticks don't spam alerts.
    await recordScorePollFailure("Both external sources returned no data for pending matches");
    return { checked: pending.length, updated: 0, matches: [], source: null, error: "No data from any source" };
  }

  const updated: PollResult["matches"] = [];

  for (const match of pending) {
    const ourHome = norm(match.homeTeam);
    const ourAway = norm(match.awayTeam);

    const ext = external.find((r) => {
      const straight = r.homeTeam === ourHome && r.awayTeam === ourAway;
      const swapped  = r.homeTeam === ourAway  && r.awayTeam === ourHome;
      const sameDay  =
        Math.abs(r.kickoff.getTime() - match.kickoff.getTime()) < 4 * 60 * 60 * 1000;
      return (straight || swapped) && sameDay;
    });

    if (!ext) continue;

    // Correctly orient scores relative to our home/away
    const homeScore = ext.homeTeam === ourHome ? ext.homeScore : ext.awayScore;
    const awayScore = ext.homeTeam === ourHome ? ext.awayScore : ext.homeScore;

    console.log(
      `[scores] auto-result #${match.matchNumber}: ` +
      `${match.homeTeam} ${homeScore}–${awayScore} ${match.awayTeam} (${source})`
    );

    await applyMatchResult(match.id, homeScore, awayScore);

    updated.push({
      matchNumber: match.matchNumber,
      home: match.homeTeam,
      away: match.awayTeam,
      score: `${homeScore}–${awayScore}`,
    });
  }

  // At least one API returned data — count as success (even if zero of our
  // specific pending matches matched, the poller itself is reachable).
  await recordScorePollSuccess();
  return { checked: pending.length, updated: updated.length, matches: updated, source };
}
