export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { startCronJobs } = await import("@/lib/cron");
    startCronJobs();
  } catch (e) {
    console.error("[instrumentation] startCronJobs failed — server is running WITHOUT scheduled jobs:", e);
  }

  try {
    const { loadVirtualTime } = await import("@/lib/time");
    await loadVirtualTime();
  } catch (e) {
    console.error("[instrumentation] loadVirtualTime failed — virtual/sim time is NOT restored:", e);
  }
}
