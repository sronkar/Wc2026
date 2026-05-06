import cron from "node-cron";
import { sendMatchReminders } from "@/lib/notifications";
import { generateLockNotifications } from "@/lib/userNotifications";
import { pollAndUpdateScores } from "@/lib/scores";
import { createDailyBackup } from "@/lib/backup";
import { cleanupStaleNotifications } from "@/lib/cleanup";
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
      console.log(`[cron] reminder tick skipped — previous run still in flight (pid=${result.heldBy.pid === -1 ? "(unknown)" : result.heldBy.pid}, startedAt=${result.heldBy.startedAt.toISOString()})`);
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
      console.log(`[cron] score-poll tick skipped — previous run still in flight (pid=${result.heldBy.pid === -1 ? "(unknown)" : result.heldBy.pid})`);
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
    // Allow backups up to 4 hours before the lock is considered stale.
    // VACUUM INTO on a multi-GB SQLite file can take significantly longer
    // than 1 hour; if the next daily tick arrives while the previous one
    // is still running, we want it to skip rather than spawn a parallel
    // backup that races on the same output file.
    }, { staleAfterMs: 4 * 60 * 60 * 1000 });
    if (result.skipped) {
      console.log(`[cron] daily-backup skipped — previous run still in flight (pid=${result.heldBy.pid === -1 ? "(unknown)" : result.heldBy.pid})`);
    }
  });

  // Daily at 04:00 UTC — prune stale MatchReminder + Notification rows
  cron.schedule("0 4 * * *", async () => {
    const result = await withJobLock("notifications-cleanup", async () => {
      try {
        const r = await cleanupStaleNotifications();
        if (r.matchRemindersDeleted > 0 || r.notificationsReadDeleted > 0 || r.notificationSentinelsDeleted > 0) {
          console.log(
            `[cron] cleanup: removed ${r.matchRemindersDeleted} MatchReminder, ` +
            `${r.notificationsReadDeleted} read Notification, ` +
            `${r.notificationSentinelsDeleted} post_game_email sentinel rows`
          );
        }
        return r;
      } catch (err) {
        console.error("[cron] cleanup job failed:", err);
      }
    });
    if (result.skipped) {
      console.log(`[cron] cleanup skipped — previous run still in flight (pid=${result.heldBy.pid === -1 ? "(unknown)" : result.heldBy.pid})`);
    }
  });

  console.log("[cron] started — reminders every 30 min, scores every 5 min, backup daily at 03:00 UTC, cleanup daily at 04:00 UTC");
}
