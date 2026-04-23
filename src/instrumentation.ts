export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronJobs } = await import("@/lib/cron");
    startCronJobs();

    // Always restore simulation/demo state from DB on startup
    const { loadVirtualTime } = await import("@/lib/time");
    await loadVirtualTime();
  }
}
