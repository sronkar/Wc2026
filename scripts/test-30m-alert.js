/**
 * test-30m-alert.js
 *
 * Focused test for the per-group "30 min to lock" alert:
 * - User A predicts the match in BOTH of their groups → no new lock_30m notification
 * - User B predicts in ONE of their two groups → gets lock_30m citing the remaining group
 * - User C predicts in NEITHER group → gets lock_30m citing both groups
 *
 * Uses direct DB (Prisma) for fixture setup + HTTP to drive sim time so the
 * Next.js server re-runs generateLockNotifications with the simulated time.
 * Cleans up test users/groups at the end. Does NOT restore from backup.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const PREFIX = "Lock30m";
const EMAIL_DOMAIN = "lock30m.test";
const PASSWORD = "Lock30mTest!";

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
  const csrfRes = await fetch2(jar, "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  const form = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE_URL}/`, json: "true", redirect: "false" });
  const cb = await fetch2(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (cb.status !== 200 && cb.status !== 302) throw new Error(`sign-in failed: ${cb.status}`);
  const sess = await fetch2(jar, "/api/auth/session");
  const body = await sess.json();
  if (!body?.user?.id) throw new Error("no session");
  return jar;
}

async function postAdminSim(jar, action, extra = {}) {
  const res = await fetch2(jar, "/api/admin/simulation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const txt = await res.text();
  let j;
  try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 200) }; }
  if (res.status !== 200) throw new Error(`sim ${action} failed (${res.status}): ${JSON.stringify(j)}`);
  return j;
}

function mark(name, pass, detail = "") {
  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  console.log("── Setup: test admin, 3 users, 2 groups ──");

  // Clean any prior run
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `${PREFIX}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.create({
    data: {
      email: `${PREFIX.toLowerCase()}-admin@${EMAIL_DOMAIN}`,
      name: `${PREFIX} Admin`,
      role: "ADMIN",
      password: hash,
      emailVerified: new Date(),
      isDemo: false, // MUST be false so notifications don't filter us out
    },
  });

  const [userA, userB, userC] = await Promise.all([
    prisma.user.create({ data: { email: `user-a@${EMAIL_DOMAIN}`, name: `${PREFIX} User A (both predicted)`, password: hash, emailVerified: new Date(), isDemo: false } }),
    prisma.user.create({ data: { email: `user-b@${EMAIL_DOMAIN}`, name: `${PREFIX} User B (one group open)`, password: hash, emailVerified: new Date(), isDemo: false } }),
    prisma.user.create({ data: { email: `user-c@${EMAIL_DOMAIN}`, name: `${PREFIX} User C (no predictions)`, password: hash, emailVerified: new Date(), isDemo: false } }),
  ]);
  console.log(`   created admin + 3 users`);

  // Two groups, every test user approved in both
  const g1 = await prisma.group.create({
    data: {
      name: `${PREFIX}: Office League`,
      description: "test",
      createdBy: admin.id,
      memberships: { create: [userA, userB, userC].map((u) => ({ userId: u.id, status: "APPROVED", memberRole: "MEMBER" })) },
    },
  });
  const g2 = await prisma.group.create({
    data: {
      name: `${PREFIX}: Family League`,
      description: "test",
      createdBy: admin.id,
      memberships: { create: [userA, userB, userC].map((u) => ({ userId: u.id, status: "APPROVED", memberRole: "MEMBER" })) },
    },
  });
  console.log(`   created 2 groups (${g1.name}, ${g2.name})`);

  // Sign admin in for sim API
  const adminJar = await signIn(admin.email, PASSWORD);
  // Make sure sim is active (pre-existing state likely has it active at some time; we want to control it)
  try { await postAdminSim(adminJar, "activate"); } catch { /* ignore if already active */ }

  // Pick a scheduled match far enough in the future that we can set virtual time into the lock_30m window.
  // Strategy: reset any match we want to use, then put virtual time at kickoff − 90 min (inside 70–110 min window).
  // Use a distant match so we don't collide with other simulation state.
  const target = await prisma.match.findFirst({
    where: { isDemo: false },
    orderBy: { matchNumber: "asc" },
  });
  if (!target) throw new Error("No match found to use as target");
  console.log(`   target match: ${target.matchNumber} ${target.homeTeam} vs ${target.awayTeam} (kickoff ${target.kickoff.toISOString()})`);
  // Reset match to SCHEDULED (clears any prior sim scoring)
  await prisma.prediction.updateMany({ where: { matchId: target.id }, data: { points: null } });
  await prisma.match.update({ where: { id: target.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });

  // Seed predictions:
  // User A: predicts in both G1 and G2
  // User B: predicts in G1 only
  // User C: no predictions
  await prisma.prediction.createMany({
    data: [
      { userId: userA.id, matchId: target.id, groupId: g1.id, homeScore: 1, awayScore: 0 },
      { userId: userA.id, matchId: target.id, groupId: g2.id, homeScore: 2, awayScore: 1 },
      { userId: userB.id, matchId: target.id, groupId: g1.id, homeScore: 0, awayScore: 0 },
    ],
  });
  console.log(`   seeded predictions: A=[G1,G2], B=[G1], C=[]`);

  // Pre-count existing lock_30m notifications so we measure delta
  const priorNotifCount = await prisma.notification.count({
    where: { type: "lock_30m", userId: { in: [userA.id, userB.id, userC.id] }, matchId: target.id },
  });

  // Move virtual time to 90 min before this match's kickoff (inside lock_30m window of 70-110 min).
  const targetTime = new Date(target.kickoff.getTime() - 90 * 60 * 1000).toISOString();
  console.log(`   advancing virtual time to ${targetTime}`);
  await postAdminSim(adminJar, "setTime", { iso: targetTime });
  // setTime in the sim API calls sendMatchReminders + generateLockNotifications directly.

  // Fetch the new lock_30m notifications for our 3 users for this match
  const notifs = await prisma.notification.findMany({
    where: { type: "lock_30m", userId: { in: [userA.id, userB.id, userC.id] }, matchId: target.id },
    orderBy: { createdAt: "desc" },
  });
  const byUser = Object.fromEntries(notifs.map((n) => [n.userId, n]));

  console.log("");
  console.log("── Assertions ──");

  let passed = 0, failed = 0;

  // User A: predicted in both groups → should NOT get a new lock_30m notification
  const aGotOne = !!byUser[userA.id];
  if (mark("User A (predicted in BOTH groups) gets no new lock_30m notification", !aGotOne,
    aGotOne ? `body="${byUser[userA.id].body}"` : "no notification created")) passed++; else failed++;

  // User B: predicted in G1 only → should get lock_30m mentioning only G2
  const bNotif = byUser[userB.id];
  const bOk = !!bNotif && bNotif.body.includes("Family League") && !bNotif.body.includes("Office League");
  if (mark("User B (predicted in G1 only) gets lock_30m mentioning only the UNpredicted group (Family League)",
    bOk, bNotif ? `body="${bNotif.body}"` : "no notification created")) passed++; else failed++;

  // User C: no predictions → should get lock_30m with generic "you haven't predicted" text
  const cNotif = byUser[userC.id];
  const cOk = !!cNotif && cNotif.body.includes("you haven't predicted");
  if (mark("User C (no predictions) gets the generic 'you haven't predicted yet' message",
    cOk, cNotif ? `body="${cNotif.body}"` : "no notification created")) passed++; else failed++;

  console.log("");
  console.log(`── Summary: ${passed} pass, ${failed} fail ──`);
  console.log(`prior notif count for target=${priorNotifCount}; after: ${notifs.length}`);

  // Cleanup
  console.log("");
  console.log("── Cleanup ──");
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `${PREFIX}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all Lock30m test data");

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
