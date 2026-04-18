import cron from "node-cron";
import { sendMatchReminders } from "@/lib/notifications";
import { pollAndUpdateScores } from "@/lib/scores";

let started = false;

export function startCronJobs() {
  if (started) return;
  started = true;

  // Every 30 min — remind users who haven't predicted a match starting in ~2 hours
  cron.schedule("*/30 * * * *", async () => {
    try {
      await sendMatchReminders();
    } catch (err) {
      console.error("[cron] reminder job failed:", err);
    }
  });

  // Every 5 min — fetch finished scores for matches 1h45m+ past kickoff
  cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await pollAndUpdateScores();
      if (result.updated > 0) {
        console.log(
          `[cron] auto-scored ${result.updated} match(es) via ${result.source}:`,
          result.matches.map((m) => `${m.home} ${m.score} ${m.away}`).join(", ")
        );
      }
    } catch (err) {
      console.error("[cron] score poll failed:", err);
    }
  });

  console.log("[cron] started — reminders every 30 min, scores every 5 min");
}
