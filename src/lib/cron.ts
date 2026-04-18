import cron from "node-cron";
import { sendMatchReminders } from "@/lib/notifications";

let started = false;

export function startCronJobs() {
  if (started) return;
  started = true;

  // Every 30 minutes — check for matches starting in ~2 hours with missing predictions
  cron.schedule("*/30 * * * *", async () => {
    try {
      await sendMatchReminders();
    } catch (err) {
      console.error("[cron] reminder job failed:", err);
    }
  });

  console.log("[cron] jobs started");
}
