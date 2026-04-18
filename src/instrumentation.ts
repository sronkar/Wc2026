export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronJobs } = await import("@/lib/cron");
    startCronJobs();

    if (process.env.DEMO_MODE === "true") {
      const { loadVirtualTime } = await import("@/lib/time");
      await loadVirtualTime();
    }
  }
}
