/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Each subsystem is wrapped in its own try/catch so a failure in one (e.g.,
 * cron registration throwing because of a bad node-cron expression) doesn't
 * prevent the others from coming up. Errors are logged loudly so ops can spot
 * a server that booted with a broken poller.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { startCronJobs } = await import("@/lib/cron");
    startCronJobs();
  } catch (e) {
    console.error("[instrumentation] startCronJobs failed — server is running WITHOUT scheduled jobs:", e);
  }

  try {
    // Always restore simulation/demo state from DB on startup
    const { loadVirtualTime } = await import("@/lib/time");
    await loadVirtualTime();
  } catch (e) {
    console.error("[instrumentation] loadVirtualTime failed — virtual/sim time is NOT restored:", e);
  }
}
