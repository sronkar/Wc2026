import { prisma } from "@/lib/prisma";

/**
 * Run an async task under an exclusive DB-backed lock keyed by job name.
 *
 * If another caller already holds the lock (active, not stale), the task is
 * SKIPPED and `withJobLock` resolves to `{ skipped: true }`. The current run
 * won't wait — cron doesn't want a queue.
 *
 * Stale locks (`startedAt` older than `staleAfterMs`, default 15 min) are
 * evicted on acquire so a crashed prior run doesn't wedge the job forever.
 *
 * Uses Prisma.create's unique-violation error to detect contention (no SELECT
 * FOR UPDATE needed on SQLite). On failure to acquire we check age and either
 * evict + retry once, or skip.
 */

const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

export type JobLockResult<T> =
  | { skipped: false; value: T }
  | { skipped: true; heldBy: { pid: number; startedAt: Date } };

async function tryAcquire(jobName: string): Promise<boolean> {
  try {
    await prisma.jobLock.create({
      data: { jobName, pid: process.pid },
    });
    return true;
  } catch {
    return false;
  }
}

async function release(jobName: string): Promise<void> {
  try {
    await prisma.jobLock.delete({ where: { jobName } });
  } catch { /* already released — fine */ }
}

export async function withJobLock<T>(
  jobName: string,
  task: () => Promise<T>,
  opts: { staleAfterMs?: number } = {}
): Promise<JobLockResult<T>> {
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  // 1. Try to acquire directly
  if (await tryAcquire(jobName)) {
    try {
      const value = await task();
      return { skipped: false, value };
    } finally {
      await release(jobName);
    }
  }

  // 2. Contention — is the existing lock stale?
  const existing = await prisma.jobLock.findUnique({ where: { jobName } });
  if (!existing) {
    // Vanished between our failed acquire and this read — try once more
    if (await tryAcquire(jobName)) {
      try {
        const value = await task();
        return { skipped: false, value };
      } finally {
        await release(jobName);
      }
    }
    // Sentinel: lock vanished + we couldn't re-acquire. The caller logs this,
    // so use a clearly-unreal pid (-1) and a stable epoch so anyone reading
    // the log can recognise "(unknown)" rather than misreading it as a real
    // process held the lock.
    return { skipped: true, heldBy: { pid: -1, startedAt: new Date(0) } };
  }

  const ageMs = Date.now() - existing.startedAt.getTime();
  if (ageMs >= staleAfterMs) {
    // Evict the stale lock and try again (best-effort; if another worker races
    // us on eviction, one of us will skip and the other will run — fine).
    await prisma.jobLock.deleteMany({
      where: { jobName, startedAt: existing.startedAt },
    });
    if (await tryAcquire(jobName)) {
      try {
        console.warn(`[jobLock] evicted stale lock for "${jobName}" (held by pid=${existing.pid}, age=${Math.round(ageMs / 1000)}s)`);
        const value = await task();
        return { skipped: false, value };
      } finally {
        await release(jobName);
      }
    }
  }

  return { skipped: true, heldBy: { pid: existing.pid, startedAt: existing.startedAt } };
}
