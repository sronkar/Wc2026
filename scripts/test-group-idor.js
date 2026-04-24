/**
 * test-group-idor.js
 *
 * Regression test for the SUB_ADMIN group-scope IDOR fix.
 *
 * Setup: 2 groups (A, B), a SUB_ADMIN user who is an APPROVED member of
 * Group A only. Then verifies:
 * - SUB_ADMIN can PATCH / GET members / manage join-link of Group A (200)
 * - SUB_ADMIN is blocked from same actions on Group B (403)
 * - A regular USER is blocked from both (403)
 * - Global ADMIN can act on both (200)
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const PREFIX = "IdorTest";
const EMAIL_DOMAIN = "idortest.test";
const PASSWORD = "IdorTest2026!";

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

function mark(name, pass, detail = "") {
  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  console.log("── Setup ──");

  // Clean slate
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupInvite.deleteMany({ where: { group: { name: { startsWith: `${PREFIX}:` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `${PREFIX}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);

  // Users
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `${PREFIX} Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const subAdmin = await prisma.user.create({
    data: { email: `subadmin@${EMAIL_DOMAIN}`, name: `${PREFIX} SubAdmin`, role: "SUB_ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const user = await prisma.user.create({
    data: { email: `user@${EMAIL_DOMAIN}`, name: `${PREFIX} User`, role: "USER", password: hash, emailVerified: new Date(), isDemo: false },
  });
  console.log(`   users: admin, subadmin (global SUB_ADMIN), regular user`);

  // Groups
  const groupA = await prisma.group.create({
    data: { name: `${PREFIX}: Group A (subadmin IS member)`, createdBy: admin.id },
  });
  const groupB = await prisma.group.create({
    data: { name: `${PREFIX}: Group B (subadmin NOT member)`, createdBy: admin.id },
  });
  // SUB_ADMIN is APPROVED member of Group A only
  await prisma.groupMembership.create({
    data: { userId: subAdmin.id, groupId: groupA.id, status: "APPROVED", memberRole: "MEMBER" },
  });
  console.log(`   groups: A (${groupA.id}), B (${groupB.id})`);
  console.log(`   subadmin is APPROVED in A, not a member of B`);

  // Sign in all three
  const adminJar = await signIn(admin.email, PASSWORD);
  const subJar = await signIn(subAdmin.email, PASSWORD);
  const userJar = await signIn(user.email, PASSWORD);
  console.log(`   signed in all three`);

  // Test helpers
  async function patchGroup(jar, groupId, payload) {
    const res = await fetch2(jar, `/api/admin/groups/${groupId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.status;
  }
  async function getMembers(jar, groupId) {
    const res = await fetch2(jar, `/api/admin/groups/${groupId}/members`);
    return res.status;
  }
  async function postJoinLink(jar, groupId) {
    const res = await fetch2(jar, `/api/admin/groups/${groupId}/join-link`, { method: "POST" });
    return res.status;
  }
  async function postInvite(jar, groupId, email) {
    const res = await fetch2(jar, `/api/groups/${groupId}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, memberRole: "MEMBER" }),
    });
    return res.status;
  }

  console.log("");
  console.log("── Assertions ──");

  let pass = 0, fail = 0;
  function assert(cond, ...args) { (cond ? pass++ : fail++); mark(...args, cond ? "OK" : ""); }

  // 1. Global ADMIN unrestricted
  assert(await patchGroup(adminJar, groupA.id, { description: "admin edited A" }) === 200, "ADMIN → PATCH Group A (200)");
  assert(await patchGroup(adminJar, groupB.id, { description: "admin edited B" }) === 200, "ADMIN → PATCH Group B (200)");
  assert(await getMembers(adminJar, groupB.id) === 200, "ADMIN → GET members of Group B (200)");

  // 2. SUB_ADMIN on Group A (member): allowed
  assert(await patchGroup(subJar, groupA.id, { description: "subadmin edited A" }) === 200, "SUB_ADMIN → PATCH Group A (member) (200)");
  assert(await getMembers(subJar, groupA.id) === 200, "SUB_ADMIN → GET members of Group A (member) (200)");
  assert(await postJoinLink(subJar, groupA.id) === 200, "SUB_ADMIN → regen join-link of Group A (member) (200)");
  assert(await postInvite(subJar, groupA.id, `newmember@${EMAIL_DOMAIN}`) === 200, "SUB_ADMIN → send invite for Group A (member) (200)");

  // 3. SUB_ADMIN on Group B (NOT member): must be 403 — the IDOR we're closing
  assert(await patchGroup(subJar, groupB.id, { description: "subadmin edited B" }) === 403, "SUB_ADMIN → PATCH Group B (non-member) blocked (403)");
  assert(await getMembers(subJar, groupB.id) === 403, "SUB_ADMIN → GET members of Group B (non-member) blocked (403)");
  assert(await postJoinLink(subJar, groupB.id) === 403, "SUB_ADMIN → regen join-link of Group B (non-member) blocked (403)");
  assert(await postInvite(subJar, groupB.id, `attacker@${EMAIL_DOMAIN}`) === 403, "SUB_ADMIN → send invite for Group B (non-member) blocked (403)");

  // 4. Regular USER: 403 everywhere
  assert(await patchGroup(userJar, groupA.id, { description: "user A" }) === 403, "USER → PATCH Group A blocked (403)");
  assert(await patchGroup(userJar, groupB.id, { description: "user B" }) === 403, "USER → PATCH Group B blocked (403)");
  assert(await getMembers(userJar, groupA.id) === 403, "USER → GET members of Group A blocked (403)");

  // 5. Unauth: 401
  assert(await patchGroup(null, groupA.id, { description: "unauth" }) === 401, "Unauth → PATCH Group A → 401");

  // 6. Verify that Group B was NOT mutated by the subadmin's attempt
  const gBAfter = await prisma.group.findUnique({ where: { id: groupB.id } });
  assert(gBAfter.description !== "subadmin edited B", "Group B description unchanged after subadmin's rejected PATCH");

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupInvite.deleteMany({ where: { group: { name: { startsWith: `${PREFIX}:` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `${PREFIX}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all IdorTest data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
