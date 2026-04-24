/**
 * test-remaining-admin-idor.js
 *
 * Second-wave IDOR closure: follow-up to test-group-idor.js.
 *
 * Before: /api/admin/custom-predictions (POST, PATCH, DELETE) and
 * /api/admin/matches/[matchId]/predictions (GET) all used the old
 * ADMIN||SUB_ADMIN gate without checking the SUB_ADMIN's membership in
 * the target group. Fixed by extending requireGroupAdminAccess / adding
 * per-group filtering.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `idor2-${STAMP}.test`;
const PASSWORD = "Idor2-2026!";

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
async function fetchJSON(jar, path, opts = {}) {
  const res = await fetch2(jar, path, opts);
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: res.status, body: j };
}
function mark(n, ok, d = "") { console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); return ok; }

async function main() {
  console.log("── Setup ──");

  await prisma.customPredictionAnswer.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.customPrediction.deleteMany({ where: { group: { name: { startsWith: `Idor2:` } } } });
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `Idor2:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `Idor2 Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const subAdmin = await prisma.user.create({
    data: { email: `subadmin@${EMAIL_DOMAIN}`, name: `Idor2 SubAdmin`, role: "SUB_ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const userA = await prisma.user.create({
    data: { email: `a@${EMAIL_DOMAIN}`, name: `Idor2 UserA`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });
  const userB = await prisma.user.create({
    data: { email: `b@${EMAIL_DOMAIN}`, name: `Idor2 UserB`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });

  const groupA = await prisma.group.create({ data: { name: `Idor2: Group A (subadmin IS member)`, createdBy: admin.id } });
  const groupB = await prisma.group.create({ data: { name: `Idor2: Group B (subadmin NOT member)`, createdBy: admin.id } });
  await prisma.groupMembership.createMany({
    data: [
      { userId: subAdmin.id, groupId: groupA.id, status: "APPROVED", memberRole: "MEMBER" },
      { userId: userA.id, groupId: groupA.id, status: "APPROVED", memberRole: "MEMBER" },
      { userId: userB.id, groupId: groupB.id, status: "APPROVED", memberRole: "MEMBER" },
    ],
  });

  // A custom prediction in each group so we have something to hit
  // Use a far-future lockTime so the sim's virtualTime (may be Jul 2026+)
  // doesn't register these as "already locked" during the PATCH test.
  const farFuture = new Date("2099-01-01T00:00:00.000Z");
  const cpA = await prisma.customPrediction.create({
    data: { groupId: groupA.id, isGlobal: false, question: "A q", options: JSON.stringify(["x","y"]), points: 3, lockTime: farFuture },
  });
  const cpB = await prisma.customPrediction.create({
    data: { groupId: groupB.id, isGlobal: false, question: "B q", options: JSON.stringify(["x","y"]), points: 3, lockTime: farFuture },
  });

  // A prediction from each user on match M1 — different groups
  const m1 = await prisma.match.findFirst({ where: { isDemo: false }, orderBy: { matchNumber: "asc" } });
  // Clean up prior test prediction rows on M1 that could pollute this test
  await prisma.prediction.deleteMany({ where: { matchId: m1.id, userId: { in: [userA.id, userB.id] } } });
  await prisma.prediction.createMany({
    data: [
      { userId: userA.id, matchId: m1.id, groupId: groupA.id, homeScore: 1, awayScore: 0 },
      { userId: userB.id, matchId: m1.id, groupId: groupB.id, homeScore: 2, awayScore: 1 },
    ],
  });

  const adminJar = await signIn(admin.email, PASSWORD);
  const subJar = await signIn(subAdmin.email, PASSWORD);
  console.log(`   admin, subadmin (member of A only), userA (A), userB (B), cpA, cpB, match-M1 preds`);

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. POST /api/admin/custom-predictions (create) ──");
  {
    // SUB_ADMIN creates in Group A → allowed
    const rA = await fetchJSON(subJar, `/api/admin/custom-predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: groupA.id, question: "from sub-admin", optionType: "FIXED", options: ["yes", "no"], points: 3 }),
    });
    assert(rA.status === 200, "SUB_ADMIN create in Group A (member): 200", `status=${rA.status}`);

    // SUB_ADMIN creates in Group B → blocked
    const rB = await fetchJSON(subJar, `/api/admin/custom-predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: groupB.id, question: "sneaky", optionType: "FIXED", options: ["yes", "no"], points: 3 }),
    });
    assert(rB.status === 403, "SUB_ADMIN create in Group B (non-member) blocked (403)", `status=${rB.status}`);

    // SUB_ADMIN creates GLOBAL → blocked (global = ADMIN only)
    const rG = await fetchJSON(subJar, `/api/admin/custom-predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isGlobal: true, question: "global sneak", optionType: "FIXED", options: ["yes", "no"], points: 3 }),
    });
    assert(rG.status === 403, "SUB_ADMIN create global blocked (403)", `status=${rG.status}`);

    // ADMIN creates in either or global → all 200
    const rAdminA = await fetchJSON(adminJar, `/api/admin/custom-predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: groupA.id, question: "admin in A", optionType: "FIXED", options: ["yes", "no"], points: 3 }),
    });
    assert(rAdminA.status === 200, "ADMIN create in Group A: 200");

    const rAdminB = await fetchJSON(adminJar, `/api/admin/custom-predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: groupB.id, question: "admin in B", optionType: "FIXED", options: ["yes", "no"], points: 3 }),
    });
    assert(rAdminB.status === 200, "ADMIN create in Group B: 200");

    const rAdminG = await fetchJSON(adminJar, `/api/admin/custom-predictions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isGlobal: true, question: "admin global", optionType: "FIXED", options: ["yes", "no"], points: 3 }),
    });
    assert(rAdminG.status === 200, "ADMIN create global: 200");
  }

  console.log("");
  console.log("── 2. GET /api/admin/custom-predictions?groupId=... ──");
  {
    const rA = await fetchJSON(subJar, `/api/admin/custom-predictions?groupId=${groupA.id}`);
    assert(rA.status === 200, "SUB_ADMIN GET Group A custom predictions: 200");

    const rB = await fetchJSON(subJar, `/api/admin/custom-predictions?groupId=${groupB.id}`);
    assert(rB.status === 403, "SUB_ADMIN GET Group B custom predictions blocked (403)", `status=${rB.status}`);
  }

  console.log("");
  console.log("── 3. PATCH/DELETE /api/admin/custom-predictions/[id] ──");
  {
    // SUB_ADMIN PATCH cpA (their group) → 200
    const rPatchA = await fetchJSON(subJar, `/api/admin/custom-predictions/${cpA.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "edited by sub-admin" }),
    });
    assert(rPatchA.status === 200, "SUB_ADMIN PATCH cpA (member): 200", `status=${rPatchA.status}`);

    // SUB_ADMIN PATCH cpB (not their group) → 403
    const rPatchB = await fetchJSON(subJar, `/api/admin/custom-predictions/${cpB.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "sneaky edit" }),
    });
    assert(rPatchB.status === 403, "SUB_ADMIN PATCH cpB (non-member) blocked (403)", `status=${rPatchB.status}`);

    // SUB_ADMIN DELETE cpB (not their group) → 403
    const rDelB = await fetchJSON(subJar, `/api/admin/custom-predictions/${cpB.id}`, { method: "DELETE" });
    assert(rDelB.status === 403, "SUB_ADMIN DELETE cpB (non-member) blocked (403)", `status=${rDelB.status}`);

    // ADMIN DELETE cpB → 200
    const rDelBAdmin = await fetchJSON(adminJar, `/api/admin/custom-predictions/${cpB.id}`, { method: "DELETE" });
    assert(rDelBAdmin.status === 200, "ADMIN DELETE cpB: 200");
  }

  console.log("");
  console.log("── 4. GET /api/admin/matches/[matchId]/predictions ──");
  {
    // ADMIN sees both preds
    const rAdmin = await fetchJSON(adminJar, `/api/admin/matches/${m1.id}/predictions`);
    const adminUserIds = Array.isArray(rAdmin.body) ? rAdmin.body.map((p) => p.userId) : [];
    assert(rAdmin.status === 200 && adminUserIds.includes(userA.id) && adminUserIds.includes(userB.id),
      "ADMIN sees predictions from BOTH groups",
      `status=${rAdmin.status}, hasA=${adminUserIds.includes(userA.id)}, hasB=${adminUserIds.includes(userB.id)}`);

    // SUB_ADMIN sees ONLY Group A's predictions (userA), NOT Group B's (userB)
    const rSub = await fetchJSON(subJar, `/api/admin/matches/${m1.id}/predictions`);
    const subUserIds = Array.isArray(rSub.body) ? rSub.body.map((p) => p.userId) : [];
    assert(rSub.status === 200, "SUB_ADMIN GET returns 200");
    assert(subUserIds.includes(userA.id), "SUB_ADMIN sees userA (their group)");
    assert(!subUserIds.includes(userB.id), "SUB_ADMIN does NOT see userB (other group)", `subUserIds includes B=${subUserIds.includes(userB.id)}`);
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.customPredictionAnswer.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.customPrediction.deleteMany({
    where: {
      OR: [
        { group: { name: { startsWith: `Idor2:` } } },
        { isGlobal: true, question: { in: ["admin global"] } },
      ],
    },
  });
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `Idor2:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all Idor2 test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
