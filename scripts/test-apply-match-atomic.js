/**
 * test-apply-match-atomic.js
 *
 * Integration test for the transactional applyMatchResult.
 *
 * Positive path:
 *   - Create 2 groups with different stagePoints, 3 predictors each, 1 match.
 *   - Call /api/admin/simulation setScore (which calls applyMatchResult).
 *   - Assert: match FINISHED, all 6 predictions scored, group-specific
 *     stage points are respected.
 *
 * Rollback path (atomicity verification):
 *   - Create a match in a FINISHED state with scored predictions.
 *   - Attempt to re-score via setScore.
 *   - During the re-score, artificially interrupt by... we can't easily
 *     mid-transaction-inject via HTTP. Instead, we simulate the failure
 *     scenario by invoking the underlying Prisma transaction pattern
 *     directly and asserting that a throw inside the transaction rolls
 *     back all writes.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `applymatch${STAMP}.test`;
const PASSWORD = "ApplyMatch2026!";

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
  if (res.status !== 200) throw new Error(`sim ${action} failed (${res.status}): ${JSON.stringify(j)}`);
  return j;
}
function mark(n, ok, d = "") { console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); return ok; }

async function main() {
  console.log("── Setup ──");

  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `ApplyMatch${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `AM Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const users = await Promise.all([1, 2, 3].map((i) =>
    prisma.user.create({
      data: { email: `u${i}@${EMAIL_DOMAIN}`, name: `AM User ${i}`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
    })
  ));

  // Group A: default points (5 exact, 1 direction)
  const groupA = await prisma.group.create({
    data: { name: `ApplyMatch${STAMP}: Group A (default)`, createdBy: admin.id, exactMatchPoints: 5, directionMatchPoints: 1 },
  });
  // Group B: custom stage points — "Group Stage" → 10/3
  const groupB = await prisma.group.create({
    data: {
      name: `ApplyMatch${STAMP}: Group B (stagePoints)`,
      createdBy: admin.id,
      exactMatchPoints: 5, directionMatchPoints: 1,
      stagePoints: JSON.stringify({ "Group Stage": { exact: 10, direction: 3 } }),
    },
  });

  // All 3 users in both groups as APPROVED
  for (const u of users) {
    await prisma.groupMembership.createMany({
      data: [
        { userId: u.id, groupId: groupA.id, status: "APPROVED", memberRole: "MEMBER" },
        { userId: u.id, groupId: groupB.id, status: "APPROVED", memberRole: "MEMBER" },
      ],
    });
  }

  // Pick a real match to use. We'll reset it to SCHEDULED + clear scores.
  const match = await prisma.match.findFirst({ where: { round: "Group Stage", isDemo: false }, orderBy: { matchNumber: "asc" } });
  if (!match) throw new Error("No group-stage match found");
  await prisma.prediction.deleteMany({ where: { matchId: match.id } }); // ensure clean slate for this test
  await prisma.match.update({ where: { id: match.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });

  // Predictions: u1 predicts exact, u2 predicts direction, u3 predicts wrong
  // Actual score will be 2-1.
  const seedPreds = [
    { u: users[0], home: 2, away: 1, label: "EXACT" },
    { u: users[1], home: 1, away: 0, label: "DIRECTION" },
    { u: users[2], home: 0, away: 3, label: "WRONG" },
  ];
  for (const p of seedPreds) {
    await prisma.prediction.createMany({
      data: [
        { userId: p.u.id, matchId: match.id, groupId: groupA.id, homeScore: p.home, awayScore: p.away },
        { userId: p.u.id, matchId: match.id, groupId: groupB.id, homeScore: p.home, awayScore: p.away },
      ],
    });
  }
  console.log(`   match ${match.matchNumber} (${match.homeTeam} vs ${match.awayTeam}), 6 predictions across A and B`);

  // Sim: activate + set virtual time shortly after kickoff so applying a score is legal
  const adminJar = await signIn(admin.email, PASSWORD);
  try { await postSim(adminJar, "activate"); } catch {}
  await postSim(adminJar, "setTime", { iso: new Date(match.kickoff.getTime() + 2 * 60 * 60 * 1000).toISOString() });

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. Positive path: setScore via sim API ──");
  await postSim(adminJar, "setScore", { matchId: match.id, homeScore: 2, awayScore: 1 });

  const afterMatch = await prisma.match.findUnique({ where: { id: match.id } });
  assert(afterMatch.status === "FINISHED", `Match status is FINISHED`, `got ${afterMatch.status}`);
  assert(afterMatch.homeScore === 2 && afterMatch.awayScore === 1, `Match score is 2-1`, `got ${afterMatch.homeScore}-${afterMatch.awayScore}`);

  const afterPreds = await prisma.prediction.findMany({
    where: { matchId: match.id },
    include: { user: { select: { email: true } }, group: { select: { name: true, exactMatchPoints: true, stagePoints: true } } },
  });
  assert(afterPreds.length === 6, `6 predictions exist`, `got ${afterPreds.length}`);
  assert(afterPreds.every((p) => p.points !== null), `All predictions have points (none null)`,
    `null count=${afterPreds.filter((p) => p.points === null).length}`);

  // Group A exact = 5, direction = 1
  const aExact = afterPreds.find((p) => p.groupId === groupA.id && p.homeScore === 2 && p.awayScore === 1);
  const aDir = afterPreds.find((p) => p.groupId === groupA.id && p.homeScore === 1 && p.awayScore === 0);
  const aWrong = afterPreds.find((p) => p.groupId === groupA.id && p.homeScore === 0 && p.awayScore === 3);
  assert(aExact.points === 5, `Group A exact match scored 5`, `got ${aExact.points}`);
  assert(aDir.points === 1, `Group A direction scored 1`, `got ${aDir.points}`);
  assert(aWrong.points === 0, `Group A wrong scored 0`, `got ${aWrong.points}`);

  // Group B stagePoints: exact = 10, direction = 3
  const bExact = afterPreds.find((p) => p.groupId === groupB.id && p.homeScore === 2 && p.awayScore === 1);
  const bDir = afterPreds.find((p) => p.groupId === groupB.id && p.homeScore === 1 && p.awayScore === 0);
  const bWrong = afterPreds.find((p) => p.groupId === groupB.id && p.homeScore === 0 && p.awayScore === 3);
  assert(bExact.points === 10, `Group B exact scored 10 (stagePoints override)`, `got ${bExact.points}`);
  assert(bDir.points === 3, `Group B direction scored 3 (stagePoints override)`, `got ${bDir.points}`);
  assert(bWrong.points === 0, `Group B wrong scored 0`, `got ${bWrong.points}`);

  console.log("");
  console.log("── 2. Rollback path: transaction atomicity ──");
  // We verify atomicity by simulating a failing transaction via Prisma directly.
  // This mirrors the exact pattern inside applyMatchResult, minus the side-effects.
  // If we throw inside $transaction, both the match-update and prediction-updates
  // must roll back.

  // First, reset the match
  await prisma.match.update({ where: { id: match.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  await prisma.prediction.updateMany({ where: { matchId: match.id }, data: { points: null } });

  const preTx = await prisma.match.findUnique({ where: { id: match.id } });
  assert(preTx.status === "SCHEDULED", `Pre-tx: match back to SCHEDULED`, `got ${preTx.status}`);

  let threwAsExpected = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: { homeScore: 9, awayScore: 9, status: "FINISHED" },
      });
      // Update first prediction's points
      const first = await tx.prediction.findFirst({ where: { matchId: match.id } });
      await tx.prediction.update({ where: { id: first.id }, data: { points: 99 } });
      // Now simulate a downstream failure
      throw new Error("simulated mid-transaction failure");
    });
  } catch (e) {
    if (e.message.includes("simulated mid-transaction failure")) threwAsExpected = true;
  }
  assert(threwAsExpected, `Transaction threw the simulated error`);

  const postRollback = await prisma.match.findUnique({ where: { id: match.id } });
  assert(postRollback.status === "SCHEDULED", `After rollback: match still SCHEDULED (not FINISHED)`, `got ${postRollback.status}`);
  assert(postRollback.homeScore === null, `After rollback: homeScore still null`, `got ${postRollback.homeScore}`);

  const afterRollbackPreds = await prisma.prediction.findMany({ where: { matchId: match.id } });
  assert(afterRollbackPreds.every((p) => p.points === null), `After rollback: all predictions still have null points`,
    `${afterRollbackPreds.filter((p) => p.points !== null).length} still have points set`);

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  // Reset the match we touched back to clean SCHEDULED state
  await prisma.prediction.deleteMany({ where: { matchId: match.id, userId: { in: users.map((u) => u.id) } } });
  await prisma.match.update({ where: { id: match.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `ApplyMatch${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all ApplyMatch test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
