/**
 * test-score-poll-alerts.js
 *
 * Validates the SystemHealth.scorePollConsecutiveFailures tracker and the
 * alert-threshold logic that lives in src/lib/scoreHealth.ts.
 *
 * The test script can't directly invoke TypeScript helpers, so it:
 *   1. Simulates the recordScorePollFailure increment pattern via Prisma
 *   2. Applies the same threshold predicate the real helper uses
 *   3. Asserts the expected alert-firing behaviour
 *
 * This validates the contract; the real helper is exercised by production
 * cron ticks when both external score APIs return empty.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ALERT_THRESHOLDS = [3, 6, 12, 24];
const FOLLOW_UP_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function shouldAlert(newCount, lastAlertAt) {
  if (ALERT_THRESHOLDS.includes(newCount)) return true;
  if (newCount <= 24) return false;
  if (!lastAlertAt) return true;
  return Date.now() - lastAlertAt.getTime() >= FOLLOW_UP_ALERT_INTERVAL_MS;
}

async function resetHealth() {
  await prisma.systemHealth.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {
      scorePollConsecutiveFailures: 0,
      scorePollLastSuccessAt: null,
      scorePollLastFailureAt: null,
      scorePollLastErrorMessage: null,
      scorePollLastAlertAt: null,
    },
  });
}

async function recordFailure(errorMessage) {
  const prior = await prisma.systemHealth.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  const newCount = prior.scorePollConsecutiveFailures + 1;
  const now = new Date();
  const alert = shouldAlert(newCount, prior.scorePollLastAlertAt);
  await prisma.systemHealth.update({
    where: { id: "default" },
    data: {
      scorePollConsecutiveFailures: newCount,
      scorePollLastFailureAt: now,
      scorePollLastErrorMessage: errorMessage,
      ...(alert ? { scorePollLastAlertAt: now } : {}),
    },
  });
  return { count: newCount, alerted: alert };
}

async function recordSuccess() {
  await prisma.systemHealth.upsert({
    where: { id: "default" },
    create: { id: "default", scorePollLastSuccessAt: new Date() },
    update: {
      scorePollConsecutiveFailures: 0,
      scorePollLastSuccessAt: new Date(),
      scorePollLastErrorMessage: null,
    },
  });
}

function mark(n, ok, d = "") { console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); return ok; }

async function main() {
  console.log("── Setup ──");
  // Save current SystemHealth state (we're about to overwrite)
  const savedHealth = await prisma.systemHealth.findUnique({ where: { id: "default" } });
  await resetHealth();
  console.log(`   health reset; prior state saved for restoration`);

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. Initial state ──");
  {
    const h = await prisma.systemHealth.findUnique({ where: { id: "default" } });
    assert(h.scorePollConsecutiveFailures === 0, "counter starts at 0", `got ${h.scorePollConsecutiveFailures}`);
    assert(h.scorePollLastAlertAt === null, "no alert yet");
  }

  console.log("");
  console.log("── 2. Failure counter increments, alert fires on 3rd ──");
  {
    const r1 = await recordFailure("simulated failure 1");
    assert(r1.count === 1 && !r1.alerted, "Failure #1: counter=1, no alert");
    const r2 = await recordFailure("simulated failure 2");
    assert(r2.count === 2 && !r2.alerted, "Failure #2: counter=2, no alert");
    const r3 = await recordFailure("simulated failure 3");
    assert(r3.count === 3 && r3.alerted, "Failure #3: counter=3, ALERT fires");

    const h = await prisma.systemHealth.findUnique({ where: { id: "default" } });
    assert(h.scorePollLastAlertAt !== null, "lastAlertAt was set on threshold hit");
    assert(h.scorePollLastErrorMessage === "simulated failure 3", "last error message captured");
  }

  console.log("");
  console.log("── 3. No alerts on 4, 5; alert on 6 and 12 ──");
  {
    const r4 = await recordFailure("f4");
    assert(r4.count === 4 && !r4.alerted, "Failure #4: no alert");
    const r5 = await recordFailure("f5");
    assert(r5.count === 5 && !r5.alerted, "Failure #5: no alert");
    const r6 = await recordFailure("f6");
    assert(r6.count === 6 && r6.alerted, "Failure #6: ALERT fires (threshold)");

    // Fast-forward to 12
    for (let i = 7; i < 12; i++) await recordFailure(`f${i}`);
    const r12 = await recordFailure("f12");
    assert(r12.count === 12 && r12.alerted, "Failure #12: ALERT fires (threshold)");
  }

  console.log("");
  console.log("── 4. Success resets counter ──");
  {
    await recordSuccess();
    const h = await prisma.systemHealth.findUnique({ where: { id: "default" } });
    assert(h.scorePollConsecutiveFailures === 0, "counter back to 0 after success", `got ${h.scorePollConsecutiveFailures}`);
    assert(h.scorePollLastErrorMessage === null, "error message cleared");
    assert(h.scorePollLastSuccessAt !== null, "lastSuccessAt set");
  }

  console.log("");
  console.log("── 5. After reset, fresh alert fires on next 3rd failure ──");
  {
    await recordFailure("post-success f1");
    await recordFailure("post-success f2");
    const r3 = await recordFailure("post-success f3");
    assert(r3.alerted, "Fresh run: alert fires again on 3rd consecutive failure");
  }

  console.log("");
  console.log("── 6. After 24 failures, follow-up alerts throttle to 1/day ──");
  {
    await resetHealth();
    // Fire 24 failures; expect alerts at 3, 6, 12, 24 (4 total)
    let alertsFired = 0;
    for (let i = 1; i <= 24; i++) {
      const r = await recordFailure(`burst ${i}`);
      if (r.alerted) alertsFired++;
    }
    assert(alertsFired === 4, `Exactly 4 alerts fired in the first 24 failures`, `got ${alertsFired}`);

    // 25th failure: no alert yet (lastAlertAt was just set)
    const r25 = await recordFailure("burst 25");
    assert(!r25.alerted, "Failure #25: no alert (just sent at 24)");

    // Manually backdate lastAlertAt by >24h and try again
    await prisma.systemHealth.update({
      where: { id: "default" },
      data: { scorePollLastAlertAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const r26 = await recordFailure("burst 26");
    assert(r26.alerted, "Failure #26 with >24h since last alert: alert fires");
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup — restoring prior SystemHealth state ──");
  if (savedHealth) {
    await prisma.systemHealth.update({
      where: { id: "default" },
      data: {
        scorePollConsecutiveFailures: savedHealth.scorePollConsecutiveFailures,
        scorePollLastSuccessAt: savedHealth.scorePollLastSuccessAt,
        scorePollLastFailureAt: savedHealth.scorePollLastFailureAt,
        scorePollLastErrorMessage: savedHealth.scorePollLastErrorMessage,
        scorePollLastAlertAt: savedHealth.scorePollLastAlertAt,
      },
    });
    console.log("   restored saved state");
  } else {
    await prisma.systemHealth.deleteMany({ where: { id: "default" } });
    console.log("   no prior state — removed the row");
  }

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
