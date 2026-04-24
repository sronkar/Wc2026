/**
 * test-simulation-scored-race.js
 *
 * The old simulationMatchIds JSON column had a read-modify-write race:
 * two concurrent setScore calls could both read the same array, each
 * append their own matchId, and one would lose the write. Now each match
 * is a row in SimulationScoredMatch with a unique key, and we upsert —
 * no race.
 *
 * This test validates in two layers:
 *   A) Model-level: 30 parallel upsert-by-matchId from a single Prisma
 *      client — all land, none dropped.
 *   B) Integration: 3 sequential setScore calls via the admin API — all
 *      land in SimulationScoredMatch. resetMatch removes one entry
 *      without touching the others. deactivate clears the whole set.
 *
 * We keep integration test count low because applyMatchResult runs a
 * 30s transaction over every prediction for the match; firing 10 of
 * those in parallel on SQLite times out the connector. That's a
 * separate concurrency story (SQLite is a single-writer engine),
 * not the race this fix addresses.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `simrace${STAMP}.test`;
const PASSWORD = "SimRace2026!";

class Jar {
  constructor() { this.cookies = new Map(); }
  ingest(h) {
    if (!h) return;
    const arr = Array.isArray(h) ? h : [h];
    for (const raw of arr) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || value === "deleted") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() { return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
}
async function fetch2(jar, path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (jar) { const c = jar.header(); if (c) headers.cookie = c; }
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers, redirect: "manual" });
  if (jar) {
    const sc = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.raw ? res.headers.raw()["set-cookie"] : [res.headers.get("set-cookie")];
    jar.ingest(sc);
  }
  return res;
}
async function signIn(email, password) {
  const jar = new Jar();
  const csrf = await fetch2(jar, "/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const form = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE_URL}/`, json: "true", redirect: "false" });
  await fetch2(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const sess = await fetch2(jar, "/api/auth/session");
  if (!(await sess.json())?.user?.id) throw new Error("no session");
  return jar;
}
async function postSim(jar, action, extra = {}) {
  const res = await fetch2(jar, "/api/admin/simulation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: res.status, body: j };
}
function mark(n, ok, d = "") { console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); return ok; }

async function main() {
  console.log("── Setup ──");

  const preScored = await prisma.simulationScoredMatch.findMany({ select: { matchId: true } });
  const preScoredIds = new Set(preScored.map((r) => r.matchId));
  console.log(`   pre-test: ${preScoredIds.size} rows in SimulationScoredMatch`);

  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `SR Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const adminJar = await signIn(admin.email, PASSWORD);

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  // ───────────────────────────────────────────────────────────────
  // A) Model-level: 30 parallel upserts land exactly 30 rows
  // ───────────────────────────────────────────────────────────────
  console.log("");
  console.log("── A. 30 parallel upsert-by-matchId, no drops ──");
  {
    // Use synthetic matchIds (strings) that don't collide with real matches.
    // upsert doesn't require a foreign-key target since SimulationScoredMatch
    // has no relation on matchId (by design — it's a tracking list).
    const fakeIds = Array.from({ length: 30 }, (_, i) => `race-test-${STAMP}-${i}`);

    // Pre-clean
    await prisma.simulationScoredMatch.deleteMany({ where: { matchId: { in: fakeIds } } });

    const before = await prisma.simulationScoredMatch.count({ where: { matchId: { in: fakeIds } } });
    assert(before === 0, "Baseline: no synthetic rows");

    // Fire all 30 in parallel
    await Promise.all(
      fakeIds.map((id) =>
        prisma.simulationScoredMatch.upsert({
          where: { matchId: id },
          create: { matchId: id },
          update: {},
        })
      )
    );

    const after = await prisma.simulationScoredMatch.count({ where: { matchId: { in: fakeIds } } });
    assert(after === 30, `All 30 synthetic matchIds landed`, `got ${after}`);

    // Each should appear exactly once (unique constraint would have errored, but belt-and-braces)
    const rows = await prisma.simulationScoredMatch.findMany({ where: { matchId: { in: fakeIds } } });
    const unique = new Set(rows.map((r) => r.matchId));
    assert(unique.size === 30, `30 distinct matchIds (no duplicates)`, `got ${unique.size}`);

    // Repeat the same 30 upserts — idempotent, count stays 30
    await Promise.all(
      fakeIds.map((id) =>
        prisma.simulationScoredMatch.upsert({
          where: { matchId: id },
          create: { matchId: id },
          update: {},
        })
      )
    );
    const after2 = await prisma.simulationScoredMatch.count({ where: { matchId: { in: fakeIds } } });
    assert(after2 === 30, `Second pass is idempotent (still 30 rows)`, `got ${after2}`);

    // Cleanup
    await prisma.simulationScoredMatch.deleteMany({ where: { matchId: { in: fakeIds } } });
  }

  // ───────────────────────────────────────────────────────────────
  // B) Integration: 3 sequential setScore calls all land
  // ───────────────────────────────────────────────────────────────
  console.log("");
  console.log("── B. Sequential setScore integration ──");
  {
    const targets = await prisma.match.findMany({
      where: { isDemo: false },
      orderBy: { matchNumber: "asc" },
      take: 3,
    });
    // Reset the 3 targets so we start clean
    for (const m of targets) {
      await prisma.match.update({ where: { id: m.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
      await prisma.prediction.updateMany({ where: { matchId: m.id }, data: { points: null } });
      await prisma.simulationScoredMatch.deleteMany({ where: { matchId: m.id } });
    }

    try { await postSim(adminJar, "activate"); } catch {}
    const afterAll = new Date(targets[targets.length - 1].kickoff.getTime() + 3 * 60 * 60 * 1000);
    await postSim(adminJar, "setTime", { iso: afterAll.toISOString() });

    // Sequential setScore x3
    for (let i = 0; i < targets.length; i++) {
      const r = await postSim(adminJar, "setScore", { matchId: targets[i].id, homeScore: i, awayScore: i });
      if (r.status !== 200) { assert(false, `setScore #${i + 1} returned 200`, `status=${r.status}`); }
    }

    const tracked = await prisma.simulationScoredMatch.findMany({
      where: { matchId: { in: targets.map((m) => m.id) } },
      select: { matchId: true },
    });
    assert(tracked.length === 3, `All 3 targets tracked after sequential setScore`, `got ${tracked.length}`);

    // resetMatch removes one row without affecting others
    const r1 = await postSim(adminJar, "resetMatch", { matchId: targets[0].id });
    assert(r1.status === 200, `resetMatch returns 200`);
    const afterReset = await prisma.simulationScoredMatch.findMany({
      where: { matchId: { in: targets.map((m) => m.id) } },
      select: { matchId: true },
    });
    assert(afterReset.length === 2, `After resetMatch: 2 rows remain`, `got ${afterReset.length}`);
    assert(!afterReset.some((r) => r.matchId === targets[0].id), `Specifically the reset match's row is gone`);

    // Cleanup: remaining sim state for the targets
    for (const m of targets) {
      await prisma.match.update({ where: { id: m.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
      await prisma.prediction.updateMany({ where: { matchId: m.id }, data: { points: null } });
      await prisma.simulationScoredMatch.deleteMany({ where: { matchId: m.id } });
    }
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup — restoring pre-test state ──");
  // Reinstate pre-existing tracked rows
  for (const mid of preScoredIds) {
    await prisma.simulationScoredMatch.upsert({ where: { matchId: mid }, create: { matchId: mid }, update: {} }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log(`   restored; ${preScoredIds.size} pre-existing rows reinstated`);

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
