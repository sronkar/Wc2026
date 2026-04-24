/**
 * test-rate-limit.js
 *
 * Regression test for rate limiting on auth + invite endpoints.
 *
 * Each run uses a fresh timestamp suffix on emails so per-email buckets
 * from prior runs don't poison the results. Per-IP buckets are harder to
 * isolate (all traffic comes from localhost); we primarily test per-key
 * buckets instead, which exercise the same rate-limit code path.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `ratelimit${STAMP}.test`;
const PASSWORD = "RateLimit2026!";

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

  // Clean any prior test state for our suffix
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `RateLimit${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `RL Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const group = await prisma.group.create({ data: { name: `RateLimit${STAMP}: Group`, createdBy: admin.id } });
  await prisma.groupMembership.create({ data: { userId: admin.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" } });
  const adminJar = await signIn(admin.email, PASSWORD);
  console.log(`   admin + group created, admin signed in`);

  let pass = 0, fail = 0;
  const assert = (cond, name, detail = "") => { (cond ? pass++ : fail++); mark(name, cond, detail); };

  console.log("");
  console.log("── 1. Forgot-password per-email limit (3/hour) ──");
  {
    const email = `victim.${STAMP}@${EMAIL_DOMAIN}`;
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const r = await fetch2(null, "/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      statuses.push(r.status);
    }
    // First 3 should be 200, 4th onward 429
    assert(statuses.slice(0, 3).every((s) => s === 200), `First 3 forgot-password calls return 200 — [${statuses.slice(0, 3).join(",")}]`);
    assert(statuses.slice(3).every((s) => s === 429), `Calls 4+ return 429 — [${statuses.slice(3).join(",")}]`);
  }

  console.log("");
  console.log("── 2. Reset-password per-IP limit (10/hour) ──");
  {
    // All requests will come from the same IP (localhost). 11th onward should be 429.
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const r = await fetch2(null, "/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: `fake-${STAMP}-${i}`, password: "whatever123" }),
      });
      statuses.push(r.status);
    }
    // First 10 should be 400 (bogus token) — they passed rate limit. 11+ should be 429.
    const firstTen = statuses.slice(0, 10);
    const rest = statuses.slice(10);
    assert(firstTen.every((s) => s === 400), `First 10 reset-password calls pass rate limit (400 for bogus token) — [${firstTen.join(",")}]`);
    assert(rest.every((s) => s === 429), `Calls 11+ return 429 — [${rest.join(",")}]`);
  }

  console.log("");
  console.log("── 3. Invite per-user limit (20/hour) ──");
  {
    const statuses = [];
    for (let i = 0; i < 22; i++) {
      const r = await fetch2(adminJar, `/api/groups/${group.id}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `invitee.${STAMP}.${i}@${EMAIL_DOMAIN}`, memberRole: "MEMBER" }),
      });
      statuses.push(r.status);
    }
    const firstTwenty = statuses.slice(0, 20);
    const rest = statuses.slice(20);
    assert(firstTwenty.every((s) => s === 200), `First 20 invite calls return 200 — [${firstTwenty.length} total]`);
    assert(rest.every((s) => s === 429), `Calls 21+ return 429 — [${rest.join(",")}]`);
  }

  console.log("");
  console.log("── 4. Credentials per-email limit (10 per 5 min) ──");
  {
    // Try bad passwords against a real user. First 10 should all authenticate-fail
    // (no session cookie), 11+ should also authenticate-fail but via rate-limit path.
    // From the client's perspective the failure mode is identical — that's the design.
    // We verify by creating a user, trying 10 bad logins (should fail all), then
    // trying the CORRECT password on attempt 11 and asserting it STILL fails (because
    // the email is rate-limited).
    const rlUser = await prisma.user.create({
      data: { email: `rluser.${STAMP}@${EMAIL_DOMAIN}`, name: `RL Victim`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
    });
    const jars = [];
    for (let i = 0; i < 10; i++) {
      const j = new Jar();
      const csrf = await fetch2(j, "/api/auth/csrf");
      const { csrfToken } = await csrf.json();
      await fetch2(j, "/api/auth/callback/credentials", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken, email: rlUser.email, password: `WRONG-${i}`,
          callbackUrl: `${BASE_URL}/`, json: "true", redirect: "false",
        }).toString(),
      });
      jars.push(j);
    }
    // Attempt 11 with CORRECT password should still fail due to rate limit
    const finalJar = new Jar();
    const csrf = await fetch2(finalJar, "/api/auth/csrf");
    const { csrfToken } = await csrf.json();
    await fetch2(finalJar, "/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken, email: rlUser.email, password: PASSWORD,
        callbackUrl: `${BASE_URL}/`, json: "true", redirect: "false",
      }).toString(),
    });
    const sess = await fetch2(finalJar, "/api/auth/session");
    const body = await sess.json();
    const signedIn = !!body?.user?.id;
    assert(!signedIn, `11th login with CORRECT password is rejected (rate-limited) — session=${signedIn ? "GOT ONE" : "none"}`);
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupInvite.deleteMany({ where: { group: { name: { startsWith: `RateLimit${STAMP}:` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `RateLimit${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all rate-limit test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
