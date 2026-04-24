import type { NextRequest } from "next/server";

/**
 * In-memory sliding-window rate limiter, keyed by an arbitrary string.
 *
 * Each call increments the counter for `key`. The counter auto-expires after
 * `windowMs`. If the count exceeds `limit`, the request is rejected. When
 * multiple instances of the app run, each has its own counter — fine for a
 * single-process deploy, not fine for a load-balanced setup. Migrate to a
 * shared store (Upstash Redis, pg-bouncer row, etc.) when that happens.
 *
 * The bucket map is bounded by a hard cap with periodic sweeps so a flood of
 * unique keys can't blow up memory.
 */

type Entry = { count: number; resetAt: number };

const MAX_KEYS = 10_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const buckets = new Map<string, Entry>();
let lastSweep = Date.now();

function sweepIfDue(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS && buckets.size < MAX_KEYS) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
  // If still over cap, drop oldest half by iteration order (Map preserves insertion order)
  if (buckets.size > MAX_KEYS) {
    const keys = Array.from(buckets.keys());
    const drop = keys.slice(0, Math.floor(keys.length / 2));
    for (const k of drop) buckets.delete(k);
  }
  lastSweep = now;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number; // epoch ms
  limit: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  // Dev / test escape hatch
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { ok: true, remaining: limit, resetAt: Date.now() + windowMs, limit };
  }

  const now = Date.now();
  sweepIfDue(now);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const entry: Entry = { count: 1, resetAt: now + windowMs };
    buckets.set(key, entry);
    return { ok: true, remaining: limit - 1, resetAt: entry.resetAt, limit };
  }

  current.count += 1;
  if (current.count > limit) {
    return { ok: false, remaining: 0, resetAt: current.resetAt, limit };
  }
  return { ok: true, remaining: limit - current.count, resetAt: current.resetAt, limit };
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const maybeIp = (req as unknown as { ip?: string }).ip;
  return maybeIp ?? "unknown";
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
    "X-RateLimit-Reset": String(Math.floor(r.resetAt / 1000)),
    ...(r.ok ? {} : { "Retry-After": String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))) }),
  };
}

// For tests only — resets the entire bucket state
export function __resetBucketsForTests(): void {
  buckets.clear();
  lastSweep = Date.now();
}
