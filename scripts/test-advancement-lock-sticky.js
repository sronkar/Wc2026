/**
 * test-advancement-lock-sticky.js
 *
 * Before: isLocked() = getNow() >= ADVANCEMENT_LOCK_TIME. In sim mode,
 * rewinding virtual time below the threshold would un-lock the picks.
 *
 * After: a persistent DemoSettings.advancementPicksLocked flag is set when
 * time first crosses the threshold and stays true until sim deactivate.
 * This test drives the full lifecycle via the admin sim API.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `advlock${STAMP}.test`;
const PASSWORD = "AdvLock2026!";
const ADV_LOCK_ISO = "2026-06-11T18:00:00.000Z";

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

  // Save pre-test state for restoration
  const preSettings = await prisma.demoSettings.findUnique({ where: { id: "demo" } });

  // Ensure a clean flag to start
  await prisma.demoSettings.upsert({
    where: { id: "demo" },
    create: { id: "demo", advancementPicksLocked: false },
    update: { advancementPicksLocked: false },
  });

  // Clean any prior test data
  await prisma.advancementPrediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `AdvLock${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `AL Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const user = await prisma.user.create({
    data: { email: `u@${EMAIL_DOMAIN}`, name: `AL User`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });
  const group = await prisma.group.create({
    data: { name: `AdvLock${STAMP}: Group`, createdBy: admin.id },
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
  // Move virtual time to Jun 10 (before lock)
  await postSim(adminJar, "setTime", { iso: "2026-06-10T12:00:00.000Z" });

  async function pick(team, pickType) {
    const res = await fetch2(userJar, "/api/advancement-predictions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: group.id, team, pick: pickType }),
    });
    return res.status;
  }
  async function pickDelete(team) {
    const res = await fetch2(userJar, `/api/advancement-predictions?groupId=${group.id}&team=${encodeURIComponent(team)}`, { method: "DELETE" });
    return res.status;
  }
  async function batchSubmit(picks) {
    const res = await fetch2(userJar, "/api/advancement-predictions/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: group.id, picks }),
    });
    return res.status;
  }

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. Before lock, picks can be submitted ──");
  {
    const r = await pick("Mexico", "WINNER");
    assert(r === 200, "POST Mexico as WINNER before lock (200)", `got ${r}`);
    const s = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
    assert(s.advancementPicksLocked === false, "Flag is NOT yet set (pre-lock)");
  }

  console.log("");
  console.log("── 2. Advance past lock — flag auto-sets on next check ──");
  {
    await postSim(adminJar, "setTime", { iso: "2026-06-11T18:05:00.000Z" });
    // Trigger a lock check by attempting an action
    const r = await pick("South Africa", "RUNNER_UP");
    assert(r === 403, "POST after crossing lock time: 403", `got ${r}`);
    const s = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
    assert(s.advancementPicksLocked === true, "Flag auto-set after crossing threshold");
  }

  console.log("");
  console.log("── 3. Rewind virtual time to BEFORE the lock — flag stays sticky ──");
  {
    await postSim(adminJar, "setTime", { iso: "2026-06-10T12:00:00.000Z" });

    const s = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
    assert(s.advancementPicksLocked === true, "Flag remains true despite time rewind");

    const rPost = await pick("South Korea", "THIRD");
    assert(rPost === 403, "POST after time rewind: still 403", `got ${rPost}`);

    const rDel = await pickDelete("Mexico");
    assert(rDel === 403, "DELETE after time rewind: still 403", `got ${rDel}`);

    const rBatch = await batchSubmit({ "Czechia": "WINNER" });
    assert(rBatch === 403, "Batch POST after time rewind: still 403", `got ${rBatch}`);
  }

  console.log("");
  console.log("── 4. Deactivate clears the flag; fresh sim can re-lock ──");
  {
    await postSim(adminJar, "deactivate");
    const s1 = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
    assert(s1.advancementPicksLocked === false, "Flag cleared on sim deactivate");

    // Re-activate + move back to pre-lock
    await postSim(adminJar, "activate");
    await postSim(adminJar, "setTime", { iso: "2026-06-10T12:00:00.000Z" });

    // Re-approve membership (deactivate may have wiped the group/user? verify)
    const mStill = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    });
    assert(!!mStill, "Group membership still exists after deactivate");

    // Re-seed an existing Mexico pick to show picks work again
    await prisma.advancementPrediction.deleteMany({ where: { userId: user.id, groupId: group.id } });
    const rAgain = await pick("Mexico", "WINNER");
    assert(rAgain === 200, "After clean sim reset: pick accepted again (200)", `got ${rAgain}`);

    // Cross the threshold a second time
    await postSim(adminJar, "setTime", { iso: "2026-06-11T18:05:00.000Z" });
    const rAgainPostLock = await pick("South Africa", "RUNNER_UP");
    assert(rAgainPostLock === 403, "After crossing threshold again: locked (403)", `got ${rAgainPostLock}`);
    const s2 = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
    assert(s2.advancementPicksLocked === true, "Flag re-set on second crossing");
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup — restoring prior sim state ──");
  await prisma.advancementPrediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `AdvLock${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  if (preSettings) {
    await prisma.demoSettings.update({
      where: { id: "demo" },
      data: {
        virtualTime: preSettings.virtualTime,
        simulationActive: preSettings.simulationActive,
        advancementPicksLocked: preSettings.advancementPicksLocked,
      },
    });
    console.log(`   restored: sim active=${preSettings.simulationActive}, advancementLocked=${preSettings.advancementPicksLocked}`);
  }

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
