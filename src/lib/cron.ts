import cron from "node-cron";
import { sendMatchReminders } from "@/lib/notifications";
import { generateLockNotifications } from "@/lib/userNotifications";
import { pollAndUpdateScores } from "@/lib/scores";
import { createDailyBackup } from "@/lib/backup";
import { withJobLock } from "@/lib/jobLock";

let started = false;

export function startCronJobs() {
  if (started) return;
  started = true;

  // Every 30 min — remind users who haven't predicted a match starting in ~2 hours.
  // Lock prevents a slow run from overlapping with the next tick and double-sending.
  cron.schedule("*/30 * * * *", async () => {
    const result = await withJobLock("reminders", async () => {
      try {
        await sendMatchReminders();
        await generateLockNotifications();
      } catch (err) {
        console.error("[cron] reminder job failed:", err);
      }
    });
    if (result.skipped) {
      console.log(`[cron] reminder tick skipped — previous run still in flight (pid=${result.heldBy.pid}, startedAt=${result.heldBy.startedAt.toISOString()})`);
    }
  });

  // Every 5 min — fetch finished scores for matches 1h45m+ past kickoff
  cron.schedule("*/5 * * * *", async () => {
    const result = await withJobLock("score-poll", async () => {
      try {
        const r = await pollAndUpdateScores();
        if (r.updated > 0) {
          console.log(
            `[cron] auto-scored ${r.updated} match(es) via ${r.source}:`,
            r.matches.map((m) => `${m.home} ${m.score} ${m.away}`).join(", ")
          );
        }
        return r;
      } catch (err) {
        console.error("[cron] score poll failed:", err);
      }
    });
    if (result.skipped) {
      console.log(`[cron] score-poll tick skipped — previous run still in flight (pid=${result.heldBy.pid})`);
    }
  });

  // Daily at 03:00 UTC — backup the database (keeps last 7 days)
  cron.schedule("0 3 * * *", async () => {
    const result = await withJobLock("daily-backup", async () => {
      try {
        await createDailyBackup();
      } catch (err) {
        console.error("[cron] backup job failed:", err);
      }
    }, { staleAfterMs: 60 * 60 * 1000 }); // backups can legitimately take longer
    if (result.skipped) {
      console.log(`[cron] daily-backup skipped — previous run still in flight (pid=${result.heldBy.pid})`);
    }
  });

  console.log("[cron] started — reminders every 30 min, scores every 5 min, backup daily at 03:00 UTC");
}
