/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Server-only startup work (cron, db state) lives in instrumentation.node.ts.
 * Splitting it out means webpack only compiles that file for the Node.js
 * runtime, so packages like web-push / nodemailer / node-cron (which import
 * Node built-ins like 'http') never end up in the Edge runtime bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
