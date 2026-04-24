/**
 * test-edit-knockout-teams.js
 *
 * Validates PATCH /api/admin/matches/[matchId]:
 *   - Admin can rename knockout teams
 *   - Group Stage matches cannot be edited (422)
 *   - FINISHED matches cannot be edited (422)
 *   - Non-admin cannot edit (403)
 *   - Existing predictions on the match are wiped when teams change
 *   - No-op PATCH (same teams) doesn't wipe predictions
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `editteams${STAMP}.test`;
const PASSWORD = "EditTeams2026!";

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
async function patch(jar, path, body) {
  const res = await fetch2(jar, path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: res.status, body: j };
}
function mark(n, ok, d = "") { console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); return ok; }

async function main() {
  console.log("── Setup ──");

  // Clean
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `ET Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const user = await prisma.user.create({
    data: { email: `u@${EMAIL_DOMAIN}`, name: `ET User`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });

  const adminJar = await signIn(admin.email, PASSWORD);
  const userJar = await signIn(user.email, PASSWORD);

  // Find one knockout match (Round of 32 e.g.) and one group-stage match for negative tests
  const knockout = await prisma.match.findFirst({ where: { round: { not: "Group Stage" }, isDemo: false }, orderBy: { matchNumber: "asc" } });
  const groupStage = await prisma.match.findFirst({ where: { round: "Group Stage", isDemo: false }, orderBy: { matchNumber: "asc" } });

  // Remember original values to restore at the end
  const origHome = knockout.homeTeam, origAway = knockout.awayTeam, origStatus = knockout.status;
  const origGsStatus = groupStage.status;

  // Ensure knockout is SCHEDULED (reset any sim state)
  await prisma.match.update({ where: { id: knockout.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
  // Ensure group stage is SCHEDULED too for the "group stage cannot be edited" test
  await prisma.match.update({ where: { id: groupStage.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });

  // Save pre-existing predictions on the knockout match (from other sim runs)
  // so we can restore them at the end. Then wipe them for a clean baseline.
  const preExistingPreds = await prisma.prediction.findMany({ where: { matchId: knockout.id } });
  await prisma.prediction.deleteMany({ where: { matchId: knockout.id } });
  console.log(`   saved ${preExistingPreds.length} pre-existing prediction(s) on M${knockout.matchNumber} for later restoration`);

  // Create a dummy group + prediction on the knockout match so we can verify the wipe
  await prisma.group.deleteMany({ where: { name: { startsWith: `EditTeams${STAMP}:` } } });
  const group = await prisma.group.create({
    data: { name: `EditTeams${STAMP}: Group`, createdBy: admin.id },
  });
  await prisma.groupMembership.create({
    data: { userId: user.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" },
  });
  await prisma.prediction.create({
    data: { userId: user.id, matchId: knockout.id, groupId: group.id, homeScore: 2, awayScore: 1 },
  });
  console.log(`   knockout target: M${knockout.matchNumber} ${origHome} vs ${origAway} (${knockout.round})`);
  console.log(`   group stage target: M${groupStage.matchNumber}`);

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. Non-admin user cannot edit teams ──");
  {
    const r = await patch(userJar, `/api/admin/matches/${knockout.id}`, { homeTeam: "Nope", awayTeam: "Nope" });
    assert(r.status === 403, "USER edit attempt rejected (403)", `got ${r.status}`);
  }

  console.log("");
  console.log("── 2. Admin edits knockout teams; predictions get wiped ──");
  {
    const predBefore = await prisma.prediction.count({ where: { matchId: knockout.id } });
    assert(predBefore === 1, "Baseline: exactly 1 prediction exists on the match (our seed)", `got ${predBefore}`);

    const r = await patch(adminJar, `/api/admin/matches/${knockout.id}`, { homeTeam: "TestTeamHome", awayTeam: "TestTeamAway" });
    assert(r.status === 200 && r.body.ok === true, "PATCH succeeds (200)", `status=${r.status} body=${JSON.stringify(r.body)}`);
    assert(r.body.predictionsWiped === 1, "Response reports 1 prediction wiped", `got ${r.body.predictionsWiped}`);

    const predAfter = await prisma.prediction.count({ where: { matchId: knockout.id } });
    assert(predAfter === 0, "Prediction actually wiped from DB", `still ${predAfter}`);

    const m = await prisma.match.findUnique({ where: { id: knockout.id } });
    assert(m.homeTeam === "TestTeamHome" && m.awayTeam === "TestTeamAway",
      "Match teams updated", `${m.homeTeam} vs ${m.awayTeam}`);
  }

  console.log("");
  console.log("── 3. No-op PATCH (same teams) doesn't wipe predictions ──");
  {
    // Re-seed a prediction
    await prisma.prediction.create({
      data: { userId: user.id, matchId: knockout.id, groupId: group.id, homeScore: 3, awayScore: 2 },
    });
    const r = await patch(adminJar, `/api/admin/matches/${knockout.id}`, { homeTeam: "TestTeamHome", awayTeam: "TestTeamAway" });
    assert(r.status === 200, "No-op PATCH returns 200");
    assert(r.body.unchanged === true, "Response flagged 'unchanged: true'");
    const predAfter = await prisma.prediction.count({ where: { matchId: knockout.id } });
    assert(predAfter === 1, "Prediction preserved on no-op", `got ${predAfter}`);
  }

  console.log("");
  console.log("── 4. Group Stage match cannot be edited ──");
  {
    const r = await patch(adminJar, `/api/admin/matches/${groupStage.id}`, { homeTeam: "CustomA", awayTeam: "CustomB" });
    assert(r.status === 422, "PATCH on group-stage match rejected (422)", `got ${r.status}`);
  }

  console.log("");
  console.log("── 5. FINISHED match cannot be edited ──");
  {
    // Mark our target knockout as FINISHED temporarily
    await prisma.match.update({ where: { id: knockout.id }, data: { status: "FINISHED", homeScore: 1, awayScore: 0 } });
    const r = await patch(adminJar, `/api/admin/matches/${knockout.id}`, { homeTeam: "WontWork", awayTeam: "Either" });
    assert(r.status === 422, "PATCH on FINISHED match rejected (422)", `got ${r.status}`);
  }

  console.log("");
  console.log("── 6. Partial update: only homeTeam ──");
  {
    // Reset the match to SCHEDULED with our test team names
    await prisma.match.update({ where: { id: knockout.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null, homeTeam: "OldHome", awayTeam: "KeepAway" } });
    await prisma.prediction.deleteMany({ where: { matchId: knockout.id } });
    const r = await patch(adminJar, `/api/admin/matches/${knockout.id}`, { homeTeam: "NewHome" });
    assert(r.status === 200, "Partial update (home only) returns 200");
    const m = await prisma.match.findUnique({ where: { id: knockout.id } });
    assert(m.homeTeam === "NewHome" && m.awayTeam === "KeepAway", "Only homeTeam changed", `${m.homeTeam} vs ${m.awayTeam}`);
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.match.update({ where: { id: knockout.id }, data: { homeTeam: origHome, awayTeam: origAway, status: origStatus, homeScore: null, awayScore: null } });
  await prisma.match.update({ where: { id: groupStage.id }, data: { status: origGsStatus } });
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `EditTeams${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  // Restore pre-existing predictions on the knockout match (wiped during step 2)
  if (preExistingPreds.length > 0) {
    await prisma.prediction.createMany({
      data: preExistingPreds.map((p) => ({
        id: p.id, userId: p.userId, matchId: p.matchId, groupId: p.groupId,
        homeScore: p.homeScore, awayScore: p.awayScore, points: p.points,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      })),
    });
    console.log(`   restored ${preExistingPreds.length} pre-existing predictions on M${knockout.matchNumber}`);
  }
  console.log("   restored original match teams and removed test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
