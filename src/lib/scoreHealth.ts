import { prisma } from "@/lib/prisma";
import { isSimulationMode } from "@/lib/time";
import { sendEmail } from "@/lib/email";

/**
 * Track consecutive failures of the external score-poller and email the
 * admin when the failure count crosses specific thresholds (3, 6, 12, 24)
 * or once per 24h beyond that.
 *
 * Why: pollAndUpdateScores currently swallows a "no data from any source"
 * result with a single console.warn. If football-data.org AND ESPN are both
 * down (or rate-limiting us) for a week, the tournament runs with stale
 * scores and nobody notices until a user complains.
 *
 * Suppressed entirely while simulation mode is active — during sim we
 * expect external APIs to return nothing for simulated-future dates.
 */

const ALERT_THRESHOLDS = [3, 6, 12, 24] as const;
const FOLLOW_UP_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function getOrInitHealth() {
  return prisma.systemHealth.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export interface HealthSnapshot {
  scorePollConsecutiveFailures: number;
  scorePollLastSuccessAt: Date | null;
  scorePollLastFailureAt: Date | null;
  scorePollLastErrorMessage: string | null;
  scorePollLastAlertAt: Date | null;
}

export async function getScoreHealth(): Promise<HealthSnapshot> {
  const h = await getOrInitHealth();
  return {
    scorePollConsecutiveFailures: h.scorePollConsecutiveFailures,
    scorePollLastSuccessAt: h.scorePollLastSuccessAt,
    scorePollLastFailureAt: h.scorePollLastFailureAt,
    scorePollLastErrorMessage: h.scorePollLastErrorMessage,
    scorePollLastAlertAt: h.scorePollLastAlertAt,
  };
}

export async function recordScorePollSuccess(): Promise<void> {
  if (isSimulationMode()) return;
  await prisma.systemHealth.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      scorePollLastSuccessAt: new Date(),
    },
    update: {
      scorePollConsecutiveFailures: 0,
      scorePollLastSuccessAt: new Date(),
      scorePollLastErrorMessage: null,
    },
  });
}

export async function recordScorePollFailure(errorMessage: string | null): Promise<void> {
  if (isSimulationMode()) return;

  const prior = await getOrInitHealth();
  const newCount = prior.scorePollConsecutiveFailures + 1;
  const now = new Date();

  const shouldAlert =
    (ALERT_THRESHOLDS as readonly number[]).includes(newCount) ||
    (newCount > 24 && (!prior.scorePollLastAlertAt || now.getTime() - prior.scorePollLastAlertAt.getTime() >= FOLLOW_UP_ALERT_INTERVAL_MS));

  await prisma.systemHealth.update({
    where: { id: "default" },
    data: {
      scorePollConsecutiveFailures: newCount,
      scorePollLastFailureAt: now,
      scorePollLastErrorMessage: errorMessage,
      ...(shouldAlert ? { scorePollLastAlertAt: now } : {}),
    },
  });

  console.error(`[scores] external poll failed — consecutive failures: ${newCount}`);

  if (shouldAlert) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const sinceSuccess = prior.scorePollLastSuccessAt
        ? `${Math.round((now.getTime() - prior.scorePollLastSuccessAt.getTime()) / 60000)} min ago`
        : "never (since this installation started tracking)";
      const html = `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto">
          <h2 style="color:#b91c1c">⚠️ Score-poll failing</h2>
          <p>The external score-poller has failed <strong>${newCount}</strong> times in a row.</p>
          <p><strong>Last success:</strong> ${sinceSuccess}<br/>
             <strong>Last error:</strong> <code>${errorMessage ?? "no specific error — both APIs returned empty"}</code></p>
          <p>Likely causes: API key expired or rate-limited (football-data.org), both sources down, or
             tournament not started yet. Check server logs for <code>[scores]</code> lines and consider
             manual scoring via the admin panel.</p>
          <p style="color:#666;font-size:12px">You'll get one more email at 6, 12, and 24 failures, then at most once per day.</p>
        </div>`;
      try {
        await sendEmail({ to: adminEmail, subject: `[SoccerPicks] Score-poll failing — ${newCount} consecutive failures`, html });
      } catch (e) {
        console.error("[scoreHealth] alert email send failed:", e);
      }
    } else {
      console.error("[scoreHealth] would alert, but ADMIN_EMAIL is not set");
    }
  }
}

// For tests — reset the counter without going through the alert path
export async function __resetScoreHealthForTests(): Promise<void> {
  await prisma.systemHealth.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {
      scorePollConsecutiveFailures: 0,
      scorePollLastSuccessAt: null,
      scorePollLastFailureAt: null,
      scorePollLastErrorMessage: null,
      scorePollLastAlertAt: null,
    },
  });
}
