/**
 * test-prediction-lock.js
 *
 * Regression test for the prediction-POST/DELETE lock enforcement
 * (now atomic — lock check + upsert/delete in one transaction).
 *
 * Exercises the boundary: kickoff − 60min is the lock line.
 *   T−90min: POST succeeds
 *   T−59min: POST rejected
 *   T−90min: DELETE succeeds
 *   T−59min: DELETE rejected
 *   T exactly at −60min (1 ms past lock): POST rejected (closes the TOCTOU)
 *
 * Uses sim API to drive virtual time deterministically.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `predlock${STAMP}.test`;
const PASSWORD = "PredLock2026!";

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
  await prisma.group.deleteMany({ where: { name: { startsWith: `PredLock${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `PL Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const user = await prisma.user.create({
    data: { email: `u@${EMAIL_DOMAIN}`, name: `PL User`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });
  const group = await prisma.group.create({
    data: { name: `PredLock${STAMP}: Group`, createdBy: admin.id },
  });
  await prisma.groupMembership.createMany({
    data: [
      { userId: admin.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" },
      { userId: user.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" },
    ],
  });

  const match = await prisma.match.findFirst({ where: { isDemo: false }, orderBy: { matchNumber: "asc" } });
  if (!match) throw new Error("No match found");
  // Make sure match is SCHEDULED for this test
  await prisma.match.update({ where: { id: match.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  await prisma.prediction.deleteMany({ where: { matchId: match.id, userId: { in: [admin.id, user.id] } } });
  console.log(`   target match: ${match.matchNumber} (${match.homeTeam} vs ${match.awayTeam}), kickoff ${match.kickoff.toISOString()}`);

  const adminJar = await signIn(admin.email, PASSWORD);
  const userJar = await signIn(user.email, PASSWORD);
  try { await postSim(adminJar, "activate"); } catch {}

  async function setTimeToOffset(minutesBeforeKickoff) {
    const ms = match.kickoff.getTime() - minutesBeforeKickoff * 60 * 1000;
    await postSim(adminJar, "setTime", { iso: new Date(ms).toISOString() });
  }
  async function postPred(home, away) {
    const res = await fetch2(userJar, "/api/predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId: match.id, groupId: group.id, homeScore: home, awayScore: away }),
    });
    return res.status;
  }
  async function delPred() {
    const res = await fetch2(userJar, `/api/predictions?matchId=${match.id}&groupId=${group.id}`, { method: "DELETE" });
    return res.status;
  }

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── Assertions ──");

  // 1. T−90min: POST succeeds
  await setTimeToOffset(90);
  assert((await postPred(1, 0)) === 200, "T−90min: POST prediction succeeds (200)");

  // 2. T−90min: DELETE succeeds (cleans up for next test)
  assert((await delPred()) === 200, "T−90min: DELETE prediction succeeds (200)");

  // 3. T−61min: still unlocked → POST succeeds
  await setTimeToOffset(61);
  assert((await postPred(2, 1)) === 200, "T−61min: POST succeeds (still 1 min before lock)");

  // 4. T−59min: past lock → POST rejected
  await setTimeToOffset(59);
  const r59 = await postPred(3, 3);
  assert(r59 === 403, "T−59min: POST rejected (403)", `got ${r59}`);

  // 5. T−59min: DELETE rejected
  const d59 = await delPred();
  assert(d59 === 403, "T−59min: DELETE rejected (403)", `got ${d59}`);

  // 6. Boundary: T−60min exactly (1ms past threshold, isPredictionLocked says yes)
  //    isPredictionLocked returns true when now >= kickoff - 60min (i.e., at the
  //    boundary and onward). We set time to exactly the boundary.
  const boundaryMs = match.kickoff.getTime() - 60 * 60 * 1000;
  await postSim(adminJar, "setTime", { iso: new Date(boundaryMs).toISOString() });
  const rBoundary = await postPred(4, 4);
  assert(rBoundary === 403, "T exactly −60min: POST rejected (boundary lock)", `got ${rBoundary}`);

  // 7. Existing prediction (from step 3) is unchanged — the 403 POSTs didn't mutate state
  const stillThere = await prisma.prediction.findFirst({
    where: { userId: user.id, matchId: match.id, groupId: group.id },
  });
  assert(stillThere && stillThere.homeScore === 2 && stillThere.awayScore === 1,
    "Prediction unchanged after rejected POSTs (no partial state)",
    stillThere ? `${stillThere.homeScore}-${stillThere.awayScore}` : "missing");

  // 8. Move time WAY forward (2h after kickoff) → match effectively in FINISHED window; POST still 403
  await setTimeToOffset(-120); // 2h after kickoff
  const rPast = await postPred(0, 0);
  assert(rPast === 403, "T+120min (2h after kickoff): POST still rejected (403)", `got ${rPast}`);

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.prediction.deleteMany({ where: { userId: { in: [admin.id, user.id] } } });
  await prisma.match.update({ where: { id: match.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `PredLock${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all PredLock test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
