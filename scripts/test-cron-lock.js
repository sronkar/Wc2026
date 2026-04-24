/**
 * test-cron-lock.js
 *
 * Verifies the JobLock table + withJobLock semantics at the DB level.
 * The test script can't import TypeScript directly, so it reimplements
 * the lock-acquire pattern inline and asserts the DB constraints hold.
 *
 * Scenarios:
 *   - First acquire wins: row created
 *   - Concurrent second acquire fails (unique violation) — caller would skip
 *   - Release: row deleted
 *   - Stale lock eviction: a row with old startedAt gets replaced
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const JOB = `test-lock-${Date.now()}`;

async function tryAcquire(name, pid = process.pid) {
  try {
    await prisma.jobLock.create({ data: { jobName: name, pid } });
    return true;
  } catch {
    return false;
  }
}

function mark(n, ok, d = "") { console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); return ok; }

async function main() {
  console.log("── Setup ──");
  // Clean any prior test locks
  await prisma.jobLock.deleteMany({ where: { jobName: { startsWith: "test-lock-" } } });

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. Basic acquire/release ──");
  assert(await tryAcquire(JOB), "First acquire succeeds");
  assert(!(await tryAcquire(JOB)), "Second acquire (while held) fails");
  const held = await prisma.jobLock.findUnique({ where: { jobName: JOB } });
  assert(held !== null && held.pid === process.pid, "Lock row exists with correct pid", `pid=${held?.pid}`);

  // Release
  await prisma.jobLock.delete({ where: { jobName: JOB } });
  const after = await prisma.jobLock.findUnique({ where: { jobName: JOB } });
  assert(after === null, "After release, row is gone");

  // Re-acquire after release
  assert(await tryAcquire(JOB), "Acquire succeeds again after release");
  await prisma.jobLock.delete({ where: { jobName: JOB } });

  console.log("");
  console.log("── 2. Stale lock eviction pattern ──");
  // Insert a stale lock manually (simulate a crashed job that never released)
  const staleJob = `${JOB}-stale`;
  const staleStartedAt = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
  await prisma.jobLock.create({
    data: { jobName: staleJob, pid: 99999, startedAt: staleStartedAt },
  });

  // A fresh acquire should fail (row exists)
  assert(!(await tryAcquire(staleJob)), "Direct acquire on stale-but-present row fails");

  // Simulate withJobLock's stale-check logic: if age >= 15 min, evict + retry
  const existing = await prisma.jobLock.findUnique({ where: { jobName: staleJob } });
  const ageMs = Date.now() - existing.startedAt.getTime();
  assert(ageMs >= 15 * 60 * 1000, `Stale lock detected (age = ${Math.round(ageMs / 1000)}s)`);

  // Atomic evict-by-startedAt (avoids evicting a fresh lock that raced in)
  const { count } = await prisma.jobLock.deleteMany({
    where: { jobName: staleJob, startedAt: existing.startedAt },
  });
  assert(count === 1, "Evict by matching startedAt removed the stale row", `count=${count}`);

  // Now acquire should succeed
  assert(await tryAcquire(staleJob), "Fresh acquire after eviction succeeds");
  await prisma.jobLock.delete({ where: { jobName: staleJob } });

  console.log("");
  console.log("── 3. Concurrent contention (10 parallel acquires, only 1 wins) ──");
  const parallelJob = `${JOB}-parallel`;
  const attempts = await Promise.all(
    Array.from({ length: 10 }, (_, i) => tryAcquire(parallelJob, 1000 + i))
  );
  const winners = attempts.filter(Boolean).length;
  assert(winners === 1, `Exactly 1 of 10 parallel acquires wins`, `winners=${winners}`);
  await prisma.jobLock.delete({ where: { jobName: parallelJob } });

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.jobLock.deleteMany({ where: { jobName: { startsWith: "test-lock-" } } });
  console.log("   removed all test lock rows");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
