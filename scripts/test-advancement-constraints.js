/**
 * test-advancement-constraints.js
 *
 * Regression test: the individual advancement-prediction POST now enforces
 * the same per-WC-group + global constraints as the batch endpoint.
 *
 * Scenarios:
 *   - Valid single WINNER/RUNNER_UP/THIRD picks → 200
 *   - 2nd WINNER for same WC group (via individual POST) → 422
 *   - 2nd RUNNER_UP for same WC group → 422
 *   - 2nd THIRD for same WC group → 422
 *   - 9th THIRD globally → 422
 *   - ELIMINATED picks unconstrained
 *   - Changing a team's pick from WINNER to RUNNER_UP doesn't trip the constraint
 *   - DELETE works
 *   - Batch endpoint still enforces (regression, not changed behavior)
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `advcons${STAMP}.test`;
const PASSWORD = "AdvCons2026!";

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

  await prisma.advancementPrediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `AdvCons${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `AC Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const user = await prisma.user.create({
    data: { email: `u@${EMAIL_DOMAIN}`, name: `AC User`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });
  const group = await prisma.group.create({
    data: { name: `AdvCons${STAMP}: Group`, createdBy: admin.id },
  });
  await prisma.groupMembership.createMany({
    data: [
      { userId: admin.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" },
      { userId: user.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" },
    ],
  });

  const adminJar = await signIn(admin.email, PASSWORD);
  const userJar = await signIn(user.email, PASSWORD);
  try { await postSim(adminJar, "activate"); } catch {}
  // Before advancement lock (2026-06-11T18:00Z)
  await postSim(adminJar, "setTime", { iso: "2026-06-10T12:00:00.000Z" });

  async function pickPost(team, pick) {
    const res = await fetch2(userJar, "/api/advancement-predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: group.id, team, pick }),
    });
    return { status: res.status, body: await res.json() };
  }
  async function pickDelete(team) {
    const res = await fetch2(userJar, `/api/advancement-predictions?groupId=${group.id}&team=${encodeURIComponent(team)}`, { method: "DELETE" });
    return res.status;
  }
  async function batchPost(picks) {
    const res = await fetch2(userJar, "/api/advancement-predictions/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: group.id, picks }),
    });
    return { status: res.status, body: await res.json() };
  }

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. Individual POST: valid picks ──");
  {
    // Group A: Mexico, South Africa, South Korea, Czechia
    let r = await pickPost("Mexico", "WINNER");
    assert(r.status === 200, "Mexico as WINNER of Group A (200)", `status=${r.status}`);
    r = await pickPost("South Africa", "RUNNER_UP");
    assert(r.status === 200, "South Africa as RUNNER_UP of Group A (200)", `status=${r.status}`);
    r = await pickPost("South Korea", "THIRD");
    assert(r.status === 200, "South Korea as THIRD of Group A (200)", `status=${r.status}`);
    r = await pickPost("Czechia", "ELIMINATED");
    assert(r.status === 200, "Czechia as ELIMINATED of Group A (200)", `status=${r.status}`);
  }

  console.log("");
  console.log("── 2. Individual POST: violation attempts ──");
  {
    // 2nd WINNER for Group A: South Korea
    let r = await pickPost("South Korea", "WINNER");
    assert(r.status === 422 && String(r.body.error).includes("Group A"), "2nd WINNER for Group A rejected (422)", `status=${r.status} body=${JSON.stringify(r.body)}`);

    // 2nd RUNNER_UP for Group A: pick Czechia → RUNNER_UP (already 1: South Africa)
    r = await pickPost("Czechia", "RUNNER_UP");
    assert(r.status === 422 && String(r.body.error).includes("runner-up"), "2nd RUNNER_UP for Group A rejected (422)", `status=${r.status}`);

    // 2nd THIRD for Group A: Czechia → THIRD (already 1: South Korea)
    r = await pickPost("Czechia", "THIRD");
    assert(r.status === 422 && String(r.body.error).includes("advance-as-3rd"), "2nd THIRD for Group A rejected (422)", `status=${r.status}`);
  }

  console.log("");
  console.log("── 3. Global THIRD cap (8) ──");
  {
    // Already 1 THIRD (South Korea in A). Add 7 more THIRDs in distinct WC groups → total 8 OK.
    const thirds = [
      ["Canada", "B"], ["Brazil", "C"], ["United States", "D"], ["Germany", "E"],
      ["Netherlands", "F"], ["Belgium", "G"], ["Spain", "H"],
    ];
    for (const [team, wc] of thirds) {
      const r = await pickPost(team, "THIRD");
      if (r.status !== 200) { assert(false, `THIRD pick for ${team} (group ${wc}) should succeed`, JSON.stringify(r.body)); return; }
    }
    assert(true, "7 additional THIRDs across Groups B-H accepted (total = 8)");

    // 9th THIRD: France from Group I
    const r = await pickPost("France", "THIRD");
    assert(r.status === 422 && String(r.body.error).includes("Maximum 8"), "9th THIRD globally rejected (422)", `status=${r.status} body=${JSON.stringify(r.body)}`);
  }

  console.log("");
  console.log("── 4. Valid transitions still work ──");
  {
    // Change Mexico from WINNER to RUNNER_UP — but South Africa is already RUNNER_UP.
    // So first un-pick South Africa, then change Mexico.
    let r = await pickDelete("South Africa");
    assert(r === 200, "DELETE South Africa pick (200)", `status=${r}`);
    const r2 = await pickPost("Mexico", "RUNNER_UP");
    assert(r2.status === 200, "Change Mexico from WINNER to RUNNER_UP (200)", `status=${r2.status} body=${JSON.stringify(r2.body)}`);

    // Now Group A has 0 WINNER, 1 RUNNER_UP. Set South Africa as WINNER — should succeed.
    const r3 = await pickPost("South Africa", "WINNER");
    assert(r3.status === 200, "South Africa as new WINNER of Group A (after swap)", `status=${r3.status}`);
  }

  console.log("");
  console.log("── 5. Batch endpoint still enforces constraints (regression) ──");
  {
    const badPicks = { "Mexico": "WINNER", "South Africa": "WINNER" }; // both WINNER in Group A
    const r = await batchPost(badPicks);
    assert(r.status === 422 && String(r.body.error).includes("Group A"), "Batch: 2 WINNERs in Group A rejected (422)", `status=${r.status} body=${JSON.stringify(r.body)}`);
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.advancementPrediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `AdvCons${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all AdvCons test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
