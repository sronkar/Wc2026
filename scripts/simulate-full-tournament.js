/**
 * simulate-full-tournament.js
 *
 * End-to-end real-usage simulation of the WC2026 prediction app.
 *
 * Timeline: Jun 10 2026 (day -1) → Jul 20 2026 (day +1)
 * Covers: 6 groups of varying size, overlapping membership, 4 time zones,
 *         email/URL/search joins, pending/approved/visitor roles,
 *         late joiners, mid-match joiners, cheating attempts,
 *         prediction lock + advancement lock enforcement, scoring correctness.
 *
 * Requires a running dev server at http://localhost:3000 and the simulation DB.
 * Writes SIMULATION_REPORT.md when done.
 *
 * Safe: the caller is expected to have backed up prisma/prisma/dev.db and will
 * restore it after this script completes. This script will leave the DB in a
 * post-tournament state — do NOT run against production data.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const REPORT_PATH = path.join(__dirname, "..", "SIMULATION_REPORT.md");
const SHARED_PASSWORD = "MegaSim2026!";
const TEST_EMAIL_DOMAIN = "megasim.test";
const TEST_NAME_PREFIX = "MegaSim";

const TIMEZONES = [
  { tz: "UTC", label: "UTC" },
  { tz: "America/Los_Angeles", label: "PST" },
  { tz: "Asia/Kolkata", label: "IST" },
  { tz: "Asia/Tokyo", label: "JST" },
];

// 6 groups (sizes: 3, 5, 8, 12, 20, 30)
const GROUP_SPECS = [
  { key: "alpha",    name: "MegaSim: Alpha Legion",    size: 3,  isPublic: true,  requirePassword: false, stage: { exact: 5, direction: 1 }, knockoutBoost: null },
  { key: "bravo",    name: "MegaSim: Bravo Squad",     size: 5,  isPublic: true,  requirePassword: false, stage: { exact: 5, direction: 1 }, knockoutBoost: { "Quarter-final": { exact: 8, direction: 2 }, "Semi-final": { exact: 10, direction: 3 }, "Final": { exact: 15, direction: 4 } } },
  { key: "charlie",  name: "MegaSim: Charlie Crew",    size: 8,  isPublic: true,  requirePassword: true,  stage: { exact: 3, direction: 1 }, knockoutBoost: null },
  { key: "delta",    name: "MegaSim: Delta Elite",     size: 12, isPublic: false, requirePassword: true,  stage: { exact: 5, direction: 2 }, knockoutBoost: null, withJoinToken: true },
  { key: "echo",     name: "MegaSim: Echo Ensemble",   size: 20, isPublic: true,  requirePassword: false, stage: { exact: 5, direction: 1 }, knockoutBoost: null, withJoinToken: true },
  { key: "foxtrot",  name: "MegaSim: Foxtrot Phenoms", size: 30, isPublic: true,  requirePassword: false, stage: { exact: 4, direction: 2 }, knockoutBoost: null, withJoinToken: true },
];

const USER_COUNT = 50;

// Persona behaviours (assigned round-robin to users)
const PERSONAS = [
  { key: "completionist",   rate: 1.00, style: "mixed" },
  { key: "casual",          rate: 0.65, style: "casual" },
  { key: "safe-picker",     rate: 0.90, style: "safe" },
  { key: "bold-picker",     rate: 0.85, style: "bold" },
  { key: "lazy",            rate: 0.30, style: "casual" },
  { key: "knockouts-only",  rate: 0.95, style: "mixed", knockoutsOnly: true },
  { key: "mid-tournament-joiner", rate: 0.80, style: "mixed", joinAfterMatch: 30 },
  { key: "mid-match-joiner",      rate: 0.80, style: "mixed", joinMidMatch: 20 },
  { key: "visitor-admin",   rate: 0.00, style: "mixed" }, // no predictions
  { key: "pending-only",    rate: 0.00, style: "mixed" }, // stuck PENDING
];

// ── Report accumulator ────────────────────────────────────────────────────────

const report = {
  startedAt: new Date().toISOString(),
  phases: [],
  current: null,
  summary: { pass: 0, fail: 0, notes: 0 },
};

function phase(name) {
  const p = { name, startedAt: new Date().toISOString(), checks: [], notes: [] };
  report.phases.push(p);
  report.current = p;
  console.log(`\n── ${name} ──`);
  return p;
}

function check(desc, pass, detail = "") {
  const mark = pass ? "✅" : "❌";
  console.log(`${mark} ${desc}${detail ? ` — ${detail}` : ""}`);
  report.current.checks.push({ desc, pass, detail });
  if (pass) report.summary.pass++;
  else report.summary.fail++;
}

function note(msg) {
  console.log(`   ℹ ${msg}`);
  report.current.notes.push(msg);
  report.summary.notes++;
}

function fail(err) {
  console.error("FATAL:", err);
  report.fatal = String(err?.stack || err);
  writeReport().finally(() => process.exit(1));
}

async function writeReport() {
  const lines = [];
  lines.push(`# WC2026 Simulation Report`);
  lines.push("");
  lines.push(`**Started:** ${report.startedAt}`);
  lines.push(`**Finished:** ${new Date().toISOString()}`);
  lines.push(`**Summary:** ${report.summary.pass} pass / ${report.summary.fail} fail / ${report.summary.notes} notes`);
  if (report.fatal) lines.push(`\n> ⚠️ FATAL: \n\`\`\`\n${report.fatal}\n\`\`\``);
  lines.push("");
  for (const p of report.phases) {
    const passed = p.checks.filter((c) => c.pass).length;
    const failed = p.checks.filter((c) => !c.pass).length;
    lines.push(`## ${p.name}`);
    lines.push(`_${passed} pass, ${failed} fail, ${p.notes.length} notes — started ${p.startedAt}_`);
    lines.push("");
    for (const c of p.checks) {
      const m = c.pass ? "✅" : "❌";
      lines.push(`- ${m} ${c.desc}${c.detail ? ` — _${c.detail}_` : ""}`);
    }
    if (p.notes.length) {
      lines.push("");
      lines.push("**Notes:**");
      for (const n of p.notes) lines.push(`- ${n}`);
    }
    lines.push("");
  }
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(`\nReport written to ${REPORT_PATH}`);
}

// ── HTTP helpers with cookie jar ─────────────────────────────────────────────

class Jar {
  constructor() { this.cookies = new Map(); }
  ingest(setCookieHeader) {
    if (!setCookieHeader) return;
    const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
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
  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function rawFetch(jar, pathOrUrl, opts = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const headers = Object.assign({}, opts.headers || {});
  if (jar) {
    const cookie = jar.header();
    if (cookie) headers["cookie"] = cookie;
  }
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  if (jar) {
    // node-fetch/undici: res.headers.getSetCookie() returns array
    const setCookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.raw ? res.headers.raw()["set-cookie"] : [res.headers.get("set-cookie")];
    jar.ingest(setCookies);
  }
  return res;
}

async function signInWithCredentials(email, password) {
  const jar = new Jar();
  // Step 1: CSRF
  const csrfRes = await rawFetch(jar, "/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  // Step 2: credentials callback
  const form = new URLSearchParams({
    csrfToken, email, password,
    callbackUrl: `${BASE_URL}/`,
    json: "true",
    redirect: "false",
  });
  const cbRes = await rawFetch(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (cbRes.status !== 200 && cbRes.status !== 302) {
    throw new Error(`Credentials sign-in failed for ${email}: ${cbRes.status}`);
  }
  // Verify session cookie exists
  const hasSession = jar.cookies.has("next-auth.session-token") ||
                     jar.cookies.has("__Secure-next-auth.session-token");
  if (!hasSession) {
    // Some NextAuth versions require hitting /api/auth/session to materialise
    const s = await rawFetch(jar, "/api/auth/session");
    const body = await s.json();
    if (!body?.user?.id) throw new Error(`No session after sign-in for ${email}`);
  }
  return jar;
}

async function asJson(res) {
  const txt = await res.text();
  try { return { status: res.status, body: JSON.parse(txt) }; }
  catch { return { status: res.status, body: txt }; }
}

// Shorthand HTTP helpers
async function httpGet(jar, p)            { return asJson(await rawFetch(jar, p)); }
async function httpPost(jar, p, body)     { return asJson(await rawFetch(jar, p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })); }
async function httpDelete(jar, p)         { return asJson(await rawFetch(jar, p, { method: "DELETE" })); }

// ── Utility: deterministic RNG ───────────────────────────────────────────────

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }

function genScore(style, r) {
  if (style === "safe")   return r() < 0.6 ? [1, 0] : [0, 0];
  if (style === "casual") return r() < 0.7 ? [0, 0] : [1, 1];
  if (style === "bold")   return [Math.floor(r() * 3) + 1, Math.floor(r() * 2)];
  // mixed
  return [Math.floor(r() * 3), Math.floor(r() * 3)];
}

// ── Global state across phases ───────────────────────────────────────────────

const S = {
  adminJar: null,          // signed-in jar for test admin
  adminUserId: null,
  users: [],               // [{ id, email, name, persona, tz, password }]
  groups: [],              // [{ id, key, name, spec }]
  allMatches: [],          // from DB, sorted by matchNumber
  simResults: new Map(),   // matchId → [home, away]
  sampledCheckMatches: new Set(), // matches we'll do HTTP rule checks on
  jarCache: new Map(),     // email → Jar (cached to avoid re-signin)
};

async function jarFor(email) {
  if (S.jarCache.has(email)) return S.jarCache.get(email);
  const j = await signInWithCredentials(email, SHARED_PASSWORD);
  S.jarCache.set(email, j);
  return j;
}

// ── Phase 0: Reset existing simulation state ─────────────────────────────────

async function phase0_reset() {
  phase("Phase 0 — Reset existing simulation state");

  // Deactivate any ongoing simulation (same logic as /api/admin/simulation deactivate)
  const scoredRows = await prisma.simulationScoredMatch.findMany({ select: { matchId: true } });
  note(`Found ${scoredRows.length} previously-scored matches; resetting to SCHEDULED`);
  for (const { matchId } of scoredRows) {
    await prisma.prediction.updateMany({ where: { matchId }, data: { points: null } });
    await prisma.match.update({ where: { id: matchId }, data: { homeScore: null, awayScore: null, status: "SCHEDULED" } });
  }
  await prisma.simulationScoredMatch.deleteMany({});
  await prisma.matchReminder.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.teamAdvancement.deleteMany({});
  await prisma.advancementPrediction.deleteMany({});
  // Clear points on any remaining predictions and reset all matches to SCHEDULED as belt-and-braces
  await prisma.prediction.updateMany({ data: { points: null } });
  await prisma.match.updateMany({ data: { homeScore: null, awayScore: null, status: "SCHEDULED" } });

  // Delete any previously-created MegaSim test data (in case re-run)
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } } });
  await prisma.advancementPrediction.deleteMany({ where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } } });
  await prisma.customPredictionAnswer.deleteMany({ where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } } });
  await prisma.groupInvite.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
  await prisma.customPrediction.deleteMany({ where: { group: { name: { startsWith: "MegaSim:" } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: "MegaSim:" } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });

  // Activate sim at Jun 10, 2026 12:00 UTC (Day -1, before first kickoff at 2026-06-11T19:00Z)
  // Must go through HTTP so the dev server's in-memory g.__wc2026_sim updates too
  // (DB-only writes won't propagate to running Next.js process).
  // Phase0 runs before we have a logged-in admin jar, so we briefly sign in here.
  await prisma.demoSettings.upsert({
    where: { id: "demo" },
    update: { simulationActive: true, virtualTime: new Date() },
    create: { id: "demo", simulationActive: true, virtualTime: new Date() },
  });
  // Ensure an admin exists for HTTP calls below. The real admin in the DB is
  // sronkar@gmail.com but may not have a password. We'll create the test admin early.
  const existingTestAdmin = await prisma.user.findUnique({ where: { email: `${TEST_NAME_PREFIX.toLowerCase()}-admin@${TEST_EMAIL_DOMAIN}` } });
  if (!existingTestAdmin) {
    const hash = await bcrypt.hash(SHARED_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: `${TEST_NAME_PREFIX.toLowerCase()}-admin@${TEST_EMAIL_DOMAIN}`,
        name: `${TEST_NAME_PREFIX} Admin`,
        role: "ADMIN",
        password: hash,
        emailVerified: new Date(),
        isDemo: true,
      },
    });
  }
  const bootstrapJar = await signInWithCredentials(`${TEST_NAME_PREFIX.toLowerCase()}-admin@${TEST_EMAIL_DOMAIN}`, SHARED_PASSWORD);
  // Activate (server picks up simulationActive=true, sets its own timeMs to Jun 11 17:00Z)
  await httpPost(bootstrapJar, "/api/admin/simulation", { action: "activate" });
  // Then move to Day -1
  const setRes = await httpPost(bootstrapJar, "/api/admin/simulation", { action: "setTime", iso: "2026-06-10T12:00:00.000Z" });
  check("Virtual time set via HTTP to 2026-06-10T12:00Z", setRes.status === 200 && setRes.body?.virtualTime?.startsWith("2026-06-10T12:"), JSON.stringify(setRes.body));

  // Load all matches
  S.allMatches = await prisma.match.findMany({ where: { isDemo: false }, orderBy: { matchNumber: "asc" } });
  check(`Loaded ${S.allMatches.length} matches from DB`, S.allMatches.length === 104, `expected 104`);
}

// ── Phase 1: Create test admin + users ───────────────────────────────────────

async function phase1_users() {
  phase("Phase 1 — Create test admin and 50 users");

  const hash = await bcrypt.hash(SHARED_PASSWORD, 10);

  // Admin (already created in Phase 0 for bootstrap HTTP calls)
  const admin = await prisma.user.findUnique({ where: { email: `${TEST_NAME_PREFIX.toLowerCase()}-admin@${TEST_EMAIL_DOMAIN}` } });
  S.adminUserId = admin.id;
  check("Test admin exists", !!admin.id);

  // Sign in as admin via HTTP to get JWT cookie
  S.adminJar = await signInWithCredentials(admin.email, SHARED_PASSWORD);
  const session = await httpGet(S.adminJar, "/api/auth/session");
  check("Admin can sign in and session reports ADMIN role",
        session.status === 200 && session.body?.user?.role === "ADMIN",
        JSON.stringify(session.body?.user ?? session.body));

  // Users
  for (let i = 0; i < USER_COUNT; i++) {
    const persona = PERSONAS[i % PERSONAS.length];
    const tz = TIMEZONES[i % TIMEZONES.length];
    const u = await prisma.user.create({
      data: {
        email: `user${String(i).padStart(2, "0")}@${TEST_EMAIL_DOMAIN}`,
        name: `${TEST_NAME_PREFIX} User ${String(i).padStart(2, "0")} (${tz.label})`,
        role: "USER",
        password: hash,
        emailVerified: new Date(),
        isDemo: true,
      },
    });
    S.users.push({ ...u, persona: persona.key, personaSpec: persona, tz: tz.tz, tzLabel: tz.label });
  }
  check(`Created ${S.users.length} test users`, S.users.length === USER_COUNT);

  // Distribution audit
  const personaCounts = {};
  for (const u of S.users) personaCounts[u.persona] = (personaCounts[u.persona] ?? 0) + 1;
  note(`Personas: ${JSON.stringify(personaCounts)}`);
  const tzCounts = {};
  for (const u of S.users) tzCounts[u.tzLabel] = (tzCounts[u.tzLabel] ?? 0) + 1;
  note(`Time zones: ${JSON.stringify(tzCounts)}`);
}

// ── Phase 2: Create groups ───────────────────────────────────────────────────

async function phase2_groups() {
  phase("Phase 2 — Create 6 groups with varied settings");

  for (const spec of GROUP_SPECS) {
    const stagePoints = {
      "Group Stage": spec.stage,
      ...(spec.knockoutBoost || {}),
    };
    const g = await prisma.group.create({
      data: {
        name: spec.name,
        description: `Simulation group (size ${spec.size}) — ${spec.isPublic ? "public" : "private"}${spec.requirePassword ? ", password required" : ""}`,
        createdBy: S.adminUserId,
        exactMatchPoints: spec.stage.exact,
        directionMatchPoints: spec.stage.direction,
        stagePoints: JSON.stringify(stagePoints),
        isPublic: spec.isPublic,
        requirePassword: spec.requirePassword,
        joinToken: spec.withJoinToken ? crypto.randomBytes(16).toString("hex") : null,
        memberships: {
          create: { userId: S.adminUserId, status: "APPROVED", memberRole: "VISITOR_ADMIN" },
        },
      },
    });
    S.groups.push({ ...g, key: spec.key, spec });
    check(`Created group "${spec.name}" (${spec.size} target, isPublic=${spec.isPublic}, reqPw=${spec.requirePassword}, joinToken=${!!g.joinToken})`, !!g.id);
  }

  // Fetch public groups via HTTP (search path) — admin sees all groups
  const listRes = await httpGet(S.adminJar, "/api/groups");
  const mine = listRes.body.filter((g) => String(g.name).startsWith("MegaSim:"));
  check("Admin GET /api/groups returns all MegaSim groups", mine.length === 6, `got ${mine.length}`);
}

// ── Membership plan ──────────────────────────────────────────────────────────
// User indices by persona: completionist=0,10,20,30,40; casual=1,11,21,31,41; etc.
// Exclude mid-tournament-joiner (persona 6: 6,16,26,36,46) and mid-match-joiner
// (persona 7: 7,17,27,37,47) from initial setup — they join later.
// Exclude pending-only (persona 9: 9,19,29,39,49) — those are assigned to groups
// but will remain PENDING (join requests not approved).

function buildMembershipPlan() {
  const lateJoinerIdxs = new Set([6, 16, 26, 36, 46]);
  const midMatchJoinerIdxs = new Set([7, 17, 27, 37, 47]);
  const pendingOnlyIdxs = [9, 19, 29, 39, 49];
  const visitorAdminIdxs = [8, 18, 28, 38, 48];

  // Deterministic seed-based distribution across groups
  const plan = {
    alpha:   { direct: [0, 10, 20] },               // 3 members — instant APPROVED
    bravo:   { email:  [1, 11, 21, 31, 41] },       // 5 via email invite
    charlie: { email:  [2, 12, 22, 32, 42, 3, 13, 23] }, // 8 via email invite (password required)
    delta:   { joinToken: [4, 14, 24, 34, 44, 5, 15, 25, 35, 45, 11, 12] }, // 12 via /join/[token]
    echo:    { email: [0, 1, 2, 3, 4, 5, 8, 15, 22, 32], // 10 via email
               joinToken: [20, 21, 30, 31, 40, 41, 29, 39, 49, 18] }, // 10 via token
    foxtrot: { joinToken: [0, 1, 2, 3, 4, 5, 8, 10, 15, 18, 20, 21, 25, 28, 30, 31, 38],
               search: [11, 13, 22, 32, 42, 43, 35, 45, 48],
               pending: [9, 19, 29, 39] }, // 4 search requests never approved
  };

  // Sanity-check and collect used indices
  const used = new Set();
  for (const group of Object.values(plan)) {
    for (const method of Object.values(group)) {
      for (const idx of method) used.add(idx);
    }
  }

  // Assign visitor-admins: user 8 → charlie VISITOR_ADMIN, 18 → echo VISITOR_ADMIN, etc.
  const visitorAssignments = {
    charlie: [8], echo: [18], foxtrot: [28, 38],
  };
  // And pending-only users that show up but aren't approved:
  const pendingAssignments = {
    alpha: [9],
    bravo: [19],
    delta: [29],
    echo: [39],
  };

  return { plan, visitorAssignments, pendingAssignments, lateJoinerIdxs, midMatchJoinerIdxs, pendingOnlyIdxs, visitorAdminIdxs };
}

// ── Phase 3: Joining via all methods + invite edge cases ────────────────────

async function phase3_joining() {
  phase("Phase 3 — Joining: direct/email/URL/search + invite edge cases");

  const { plan, visitorAssignments, pendingAssignments } = buildMembershipPlan();
  const groupByKey = Object.fromEntries(S.groups.map((g) => [g.key, g]));

  // ── 3a. Direct-insert APPROVED (alpha) ─────────────────────────────────────
  for (const userIdx of plan.alpha.direct) {
    const u = S.users[userIdx];
    await prisma.groupMembership.create({
      data: { userId: u.id, groupId: groupByKey.alpha.id, status: "APPROVED", memberRole: "MEMBER" },
    });
  }
  const alphaCount = await prisma.groupMembership.count({ where: { groupId: groupByKey.alpha.id, status: "APPROVED" } });
  check(`Alpha: direct-insert 3 approved members`, alphaCount === 4, `got ${alphaCount} (includes admin as VISITOR_ADMIN)`);

  // ── 3b. Email invite flow (bravo) — via HTTP, admin sends invites ─────────
  for (const userIdx of plan.bravo.email) {
    const u = S.users[userIdx];
    const inv = await httpPost(S.adminJar, `/api/groups/${groupByKey.bravo.id}/invite`, { email: u.email, memberRole: "MEMBER" });
    if (inv.status !== 200) { check(`Invite create for user${userIdx} to bravo`, false, `status=${inv.status}`); continue; }
    const token = inv.body.inviteUrl.split("/invite/").pop();
    // User signs in and accepts
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    const acc = await httpPost(uJar, `/api/invite/${token}`, {});
    if (acc.status !== 200) check(`User${userIdx} accept bravo invite`, false, `status=${acc.status}, body=${JSON.stringify(acc.body)}`);
  }
  const bravoCount = await prisma.groupMembership.count({ where: { groupId: groupByKey.bravo.id, status: "APPROVED" } });
  check(`Bravo: 5 users joined via email invite`, bravoCount === 6, `got ${bravoCount} (includes admin)`);

  // ── 3c. Email invite with password-required group (charlie) ──────────────
  let charliePwChecksPassed = 0;
  for (let i = 0; i < plan.charlie.email.length; i++) {
    const userIdx = plan.charlie.email[i];
    const u = S.users[userIdx];
    const inv = await httpPost(S.adminJar, `/api/groups/${groupByKey.charlie.id}/invite`, { email: u.email, memberRole: "MEMBER" });
    const token = inv.body.inviteUrl.split("/invite/").pop();
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    // All test users have a password, so invite acceptance should succeed without needing to set one
    const acc = await httpPost(uJar, `/api/invite/${token}`, {});
    if (acc.status === 200) charliePwChecksPassed++;
  }
  check(`Charlie: 8 users joined via password-required invite (had password already)`, charliePwChecksPassed === 8, `${charliePwChecksPassed}/8`);

  // ── 3d. /api/join/[token] flow (delta, private with joinToken) ───────────
  let deltaJoined = 0;
  for (const userIdx of plan.delta.joinToken) {
    const u = S.users[userIdx];
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    const acc = await httpPost(uJar, `/api/join/${groupByKey.delta.joinToken}`, {});
    if (acc.status === 200) deltaJoined++;
  }
  check(`Delta (private): 12 users joined via /join/[token]`, deltaJoined === 12, `got ${deltaJoined}`);

  // ── 3e. Echo: mix of email invites + joinToken ───────────────────────────
  let echoJoined = 0;
  for (const userIdx of plan.echo.email) {
    const u = S.users[userIdx];
    const inv = await httpPost(S.adminJar, `/api/groups/${groupByKey.echo.id}/invite`, { email: u.email, memberRole: "MEMBER" });
    const token = inv.body.inviteUrl.split("/invite/").pop();
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    const acc = await httpPost(uJar, `/api/invite/${token}`, {});
    if (acc.status === 200) echoJoined++;
  }
  for (const userIdx of plan.echo.joinToken) {
    const u = S.users[userIdx];
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    const acc = await httpPost(uJar, `/api/join/${groupByKey.echo.joinToken}`, {});
    if (acc.status === 200) echoJoined++;
  }
  check(`Echo: 20 users joined (10 email + 10 joinToken)`, echoJoined === 20, `got ${echoJoined}`);

  // ── 3f. Foxtrot: joinToken + search-and-request flow ────────────────────
  let foxtrotTokenJoined = 0;
  for (const userIdx of plan.foxtrot.joinToken) {
    const u = S.users[userIdx];
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    const acc = await httpPost(uJar, `/api/join/${groupByKey.foxtrot.joinToken}`, {});
    if (acc.status === 200) foxtrotTokenJoined++;
  }
  check(`Foxtrot: joinToken route — ${foxtrotTokenJoined}/${plan.foxtrot.joinToken.length}`, foxtrotTokenJoined === plan.foxtrot.joinToken.length);

  // Search-and-request: POST /api/groups/[id]/join creates PENDING, admin approves via DB
  let foxtrotSearchApproved = 0;
  for (const userIdx of plan.foxtrot.search) {
    const u = S.users[userIdx];
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    // First verify they can find via search
    const search = await httpGet(uJar, `/api/groups?search=Foxtrot`);
    const found = Array.isArray(search.body) && search.body.some((g) => g.name.includes("Foxtrot"));
    if (!found) { check(`User${userIdx} search for Foxtrot`, false); continue; }
    // Request to join
    const req = await httpPost(uJar, `/api/groups/${groupByKey.foxtrot.id}/join`, {});
    if (req.status !== 201 && req.status !== 200) { check(`User${userIdx} POST join request`, false, `status=${req.status}`); continue; }
    // Admin approves directly in DB
    await prisma.groupMembership.update({
      where: { userId_groupId: { userId: u.id, groupId: groupByKey.foxtrot.id } },
      data: { status: "APPROVED" },
    });
    foxtrotSearchApproved++;
  }
  check(`Foxtrot: search-and-request flow — ${foxtrotSearchApproved}/${plan.foxtrot.search.length} approved`, foxtrotSearchApproved === plan.foxtrot.search.length);

  // Pending users (join requests stay unresolved)
  for (const userIdx of plan.foxtrot.pending) {
    const u = S.users[userIdx];
    const uJar = await signInWithCredentials(u.email, SHARED_PASSWORD);
    await httpPost(uJar, `/api/groups/${groupByKey.foxtrot.id}/join`, {});
  }
  const foxtrotPending = await prisma.groupMembership.count({ where: { groupId: groupByKey.foxtrot.id, status: "PENDING" } });
  check(`Foxtrot: ${plan.foxtrot.pending.length} join requests remain PENDING`, foxtrotPending === plan.foxtrot.pending.length, `got ${foxtrotPending}`);

  // ── 3g. Visitor admin assignments ──────────────────────────────────────
  for (const [groupKey, userIdxs] of Object.entries(visitorAssignments)) {
    const g = groupByKey[groupKey];
    for (const idx of userIdxs) {
      const u = S.users[idx];
      await prisma.groupMembership.upsert({
        where: { userId_groupId: { userId: u.id, groupId: g.id } },
        update: { memberRole: "VISITOR_ADMIN" },
        create: { userId: u.id, groupId: g.id, status: "APPROVED", memberRole: "VISITOR_ADMIN" },
      });
    }
  }
  const visitorCount = await prisma.groupMembership.count({ where: { memberRole: "VISITOR_ADMIN", userId: { in: S.users.map((u) => u.id) } } });
  check(`Visitor-admins assigned: ${visitorCount} total`, visitorCount === 4);

  // ── 3h. Extra PENDING users (never approved) ──────────────────────────
  for (const [groupKey, userIdxs] of Object.entries(pendingAssignments)) {
    const g = groupByKey[groupKey];
    for (const idx of userIdxs) {
      const u = S.users[idx];
      await prisma.groupMembership.upsert({
        where: { userId_groupId: { userId: u.id, groupId: g.id } },
        update: { status: "PENDING" },
        create: { userId: u.id, groupId: g.id, status: "PENDING", memberRole: "MEMBER" },
      });
    }
  }
  const totalPending = await prisma.groupMembership.count({ where: { status: "PENDING", userId: { in: S.users.map((u) => u.id) } } });
  check(`Total PENDING memberships across groups: ${totalPending}`, totalPending >= 8, `got ${totalPending}`);

  // ── 3i. Invite edge cases (cheating / misuse) ─────────────────────────
  // (i) Expired invite
  const expiredToken = crypto.randomBytes(32).toString("hex");
  await prisma.groupInvite.create({
    data: { groupId: groupByKey.alpha.id, email: S.users[48].email, memberRole: "MEMBER", token: expiredToken, expiresAt: new Date("2020-01-01"), createdBy: S.adminUserId },
  });
  const expiredJar = await signInWithCredentials(S.users[48].email, SHARED_PASSWORD);
  const expiredRes = await httpPost(expiredJar, `/api/invite/${expiredToken}`, {});
  check("Expired invite rejected with 410", expiredRes.status === 410, `status=${expiredRes.status}`);

  // (ii) Invite-email mismatch (invite sent to X, signed in as Y)
  const mismatchToken = crypto.randomBytes(32).toString("hex");
  await prisma.groupInvite.create({
    data: { groupId: groupByKey.alpha.id, email: S.users[47].email, memberRole: "MEMBER", token: mismatchToken, expiresAt: new Date("2027-01-01"), createdBy: S.adminUserId },
  });
  // User 48 (wrong one) tries to accept an invite sent to user 47
  const mismatchRes = await httpPost(expiredJar, `/api/invite/${mismatchToken}`, {});
  check("Invite email mismatch rejected with 403", mismatchRes.status === 403, `status=${mismatchRes.status}`);

  // (iii) Already-used invite: accept then re-accept
  const usedToken = crypto.randomBytes(32).toString("hex");
  await prisma.groupInvite.create({
    data: { groupId: groupByKey.bravo.id, email: S.users[47].email, memberRole: "MEMBER", token: usedToken, expiresAt: new Date("2027-01-01"), createdBy: S.adminUserId },
  });
  const u47Jar = await signInWithCredentials(S.users[47].email, SHARED_PASSWORD);
  const firstAccept = await httpPost(u47Jar, `/api/invite/${usedToken}`, {});
  check("First acceptance of invite succeeds", firstAccept.status === 200, `status=${firstAccept.status}`);
  const secondAccept = await httpPost(u47Jar, `/api/invite/${usedToken}`, {});
  check("Re-using already-accepted invite rejected with 410", secondAccept.status === 410, `status=${secondAccept.status}`);

  // (iv) Unauth user trying to accept
  const unauthRes = await httpPost(null, `/api/invite/${usedToken}`, {});
  check("Unauth invite accept rejected with 401", unauthRes.status === 401, `status=${unauthRes.status}`);

  // ── 3j. Snapshot membership state ───────────────────────────────────
  for (const g of S.groups) {
    const m = await prisma.groupMembership.count({ where: { groupId: g.id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } } });
    note(`${g.name}: ${m} approved predictors`);
  }
}

// ── Phase 4: Pre-tournament advancement predictions + constraint validation ─

async function phase4_advancement() {
  phase("Phase 4 — Advancement predictions (before lock at 2026-06-11T18:00Z)");

  const WC_GROUPS = {
    A: ["Mexico", "South Africa", "South Korea", "Czechia"],
    B: ["Canada", "Bosnia-Herzegovina", "Qatar", "Switzerland"],
    C: ["Brazil", "Morocco", "Haiti", "Scotland"],
    D: ["United States", "Paraguay", "Australia", "Turkey"],
    E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
    F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
    G: ["Belgium", "Egypt", "Iran", "New Zealand"],
    H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
    I: ["France", "Senegal", "Iraq", "Norway"],
    J: ["Austria", "Jordan", "Argentina", "Algeria"],
    K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
    L: ["England", "Croatia", "Ghana", "Panama"],
  };

  // For each user, for each group they're in, submit a valid picks set.
  // Build picks: first team = WINNER, second = RUNNER_UP, third = THIRD, fourth = ELIMINATED (implicit)
  // Vary slightly by user index for realism.
  const approvedMemberships = await prisma.groupMembership.findMany({
    where: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" }, user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } },
    include: { user: { select: { email: true } } },
  });

  let submittedCount = 0;
  let skipped = 0;
  for (const m of approvedMemberships) {
    // Find user in S.users (to access persona)
    const user = S.users.find((u) => u.id === m.userId);
    if (!user) continue;
    // Skip some users (casual/lazy don't submit advancement)
    if (user.persona === "lazy" && Math.random() < 0.7) { skipped++; continue; }
    if (user.persona === "casual" && Math.random() < 0.4) { skipped++; continue; }

    // Build picks — rotate seed by user index for variety
    const r = rng(Number(user.email.replace(/\D/g, "") || 1) * 31);
    const picks = {};
    for (const [wcGroup, teams] of Object.entries(WC_GROUPS)) {
      const shuffled = [...teams].sort(() => r() - 0.5);
      picks[shuffled[0]] = "WINNER";
      picks[shuffled[1]] = "RUNNER_UP";
      // Only put 8 thirds total globally; so pick only some groups' 3rd
      if (Math.floor(r() * 2)) picks[shuffled[2]] = "THIRD";
    }
    // Sign in as user and submit via batch endpoint
    const uJar = await signInWithCredentials(user.email, SHARED_PASSWORD);
    const res = await httpPost(uJar, `/api/advancement-predictions/batch`, { groupId: m.groupId, picks });
    if (res.status === 200) submittedCount++;
  }
  check(`Advancement predictions submitted by ${submittedCount} (user,group) pairs (${skipped} intentionally skipped)`, submittedCount > 0);

  // ── 4a. Constraint violations ──────────────────────────────────────────
  const testUser = S.users.find((u) => u.persona === "completionist");
  const anyGroup = await prisma.groupMembership.findFirst({
    where: { userId: testUser.id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
  });
  const uJar = await signInWithCredentials(testUser.email, SHARED_PASSWORD);

  // (a) Two winners in one group
  const badPicks1 = { "Mexico": "WINNER", "South Africa": "WINNER" };
  const bad1 = await httpPost(uJar, `/api/advancement-predictions/batch`, { groupId: anyGroup.groupId, picks: badPicks1 });
  check("Two winners in same WC group rejected (422)", bad1.status === 422, `status=${bad1.status}, body=${JSON.stringify(bad1.body)}`);

  // (b) Too many 3rds (>8)
  const badPicks2 = {};
  let thirdCount = 0;
  for (const teams of Object.values(WC_GROUPS)) {
    if (thirdCount < 9) { badPicks2[teams[2]] = "THIRD"; thirdCount++; }
  }
  const bad2 = await httpPost(uJar, `/api/advancement-predictions/batch`, { groupId: anyGroup.groupId, picks: badPicks2 });
  check("9 global 3rd-place picks rejected (422)", bad2.status === 422, `status=${bad2.status}, body=${JSON.stringify(bad2.body)}`);

  // (c) VISITOR_ADMIN cannot submit
  const va = S.users[18]; // visitor-admin persona, in echo
  const vaJar = await signInWithCredentials(va.email, SHARED_PASSWORD);
  const vaGroup = S.groups.find((g) => g.key === "echo");
  const vaRes = await httpPost(vaJar, `/api/advancement-predictions/batch`, { groupId: vaGroup.id, picks: { "Mexico": "WINNER" } });
  check("VISITOR_ADMIN submitting advancement rejected (403)", vaRes.status === 403, `status=${vaRes.status}`);

  // (d) PENDING member cannot submit (individual endpoint)
  const pendingU = S.users[9];
  const pJar = await signInWithCredentials(pendingU.email, SHARED_PASSWORD);
  const alphaG = S.groups.find((g) => g.key === "alpha");
  const pRes = await httpPost(pJar, `/api/advancement-predictions`, { groupId: alphaG.id, team: "Mexico", pick: "WINNER" });
  check("PENDING member submitting advancement rejected (403)", pRes.status === 403, `status=${pRes.status}`);
}

// ── Phase 5: Advance time past advancement lock; verify enforcement ─────────

async function phase5_advancementLock() {
  phase("Phase 5 — Advancement lock (2026-06-11T18:00Z)");

  // Advance via HTTP sim endpoint
  const res = await httpPost(S.adminJar, "/api/admin/simulation", { action: "setTime", iso: "2026-06-11T18:01:00.000Z" });
  check("setTime to 2026-06-11T18:01Z succeeded", res.status === 200, JSON.stringify(res.body));

  // Attempt to submit or update advancement
  const completionist = S.users.find((u) => u.persona === "completionist");
  const uJar = await signInWithCredentials(completionist.email, SHARED_PASSWORD);
  const m = await prisma.groupMembership.findFirst({
    where: { userId: completionist.id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
  });

  const lockedRes = await httpPost(uJar, `/api/advancement-predictions/batch`, { groupId: m.groupId, picks: { "Mexico": "WINNER" } });
  check("Advancement batch submit after lock rejected (403)", lockedRes.status === 403, `status=${lockedRes.status}`);

  const lockedRes2 = await httpPost(uJar, `/api/advancement-predictions`, { groupId: m.groupId, team: "Brazil", pick: "WINNER" });
  check("Advancement individual submit after lock rejected (403)", lockedRes2.status === 403, `status=${lockedRes2.status}`);

  const lockedRes3 = await httpDelete(uJar, `/api/advancement-predictions?groupId=${m.groupId}&team=Mexico`);
  check("Advancement delete after lock rejected (403)", lockedRes3.status === 403, `status=${lockedRes3.status}`);
}

// ── Phase 6: Group stage — match by match ───────────────────────────────────

async function generatePredictionsForMatch(matchId, match, approvedByGroup) {
  // approvedByGroup: Map<groupId, [{userId, persona, personaSpec}]>
  const records = [];
  for (const [groupId, members] of approvedByGroup.entries()) {
    for (const m of members) {
      const spec = m.personaSpec;
      if (spec.knockoutsOnly && match.round === "Group Stage") continue;
      // Rate gate (persona skip rate)
      const rseed = Number(String(m.userId).replace(/\D/g, "").slice(-6) || "1") + match.matchNumber;
      const r = rng(rseed);
      if (r() > spec.rate) continue;
      const [h, a] = genScore(spec.style, rng(rseed * 7));
      records.push({ userId: m.userId, matchId, groupId, homeScore: h, awayScore: a });
    }
  }
  if (records.length) {
    // SQLite provider doesn't support skipDuplicates; rely on phase-0 wipe for clean slate
    await prisma.prediction.createMany({ data: records });
  }
  return records.length;
}

function pickMatchResult(match) {
  // Deterministic result per match, favouring "higher-profile" home teams slightly
  const r = rng(match.matchNumber * 997 + 13);
  // Distribution: ~35% home win, 30% away win, 20% draw, 15% decisive
  const outcome = r();
  let home, away;
  if (outcome < 0.35) { home = 1 + Math.floor(r() * 3); away = Math.floor(r() * Math.min(home, 2)); }
  else if (outcome < 0.65) { away = 1 + Math.floor(r() * 3); home = Math.floor(r() * Math.min(away, 2)); }
  else if (outcome < 0.85) { home = Math.floor(r() * 3); away = home; }
  else { home = 2 + Math.floor(r() * 3); away = Math.floor(r() * 2); }
  return [Math.max(0, home), Math.max(0, away)];
}

async function setMatchScore(matchId, home, away) {
  const res = await httpPost(S.adminJar, "/api/admin/simulation", { action: "setScore", matchId, homeScore: home, awayScore: away });
  if (res.status !== 200) throw new Error(`setScore failed for ${matchId}: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function advanceSimTime(isoOrDate) {
  const iso = typeof isoOrDate === "string" ? isoOrDate : isoOrDate.toISOString();
  const res = await httpPost(S.adminJar, "/api/admin/simulation", { action: "setTime", iso });
  if (res.status !== 200) throw new Error(`setTime failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function phase6_groupStage() {
  phase("Phase 6 — Group stage (72 matches) with rule-enforcement sampling");

  const groupStage = S.allMatches.filter((m) => m.round === "Group Stage");
  check(`Group stage match count`, groupStage.length === 72, `got ${groupStage.length}`);

  // Build per-group approved-predictor lists (refreshed as late joiners appear)
  async function loadApproved() {
    const rows = await prisma.groupMembership.findMany({
      where: {
        status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" },
        user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
        group: { name: { startsWith: "MegaSim:" } },
      },
      select: { userId: true, groupId: true, user: { select: { email: true } } },
    });
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.groupId)) map.set(r.groupId, []);
      const user = S.users.find((u) => u.email === r.user.email);
      if (user) map.get(r.groupId).push({ userId: r.userId, persona: user.persona, personaSpec: user.personaSpec });
    }
    return map;
  }

  let approved = await loadApproved();

  // Rule-check sample points (selected matches for HTTP verifications)
  const lockCheckSamples = new Set([1, 15, 30, 50, 72]);      // 5 matches for after-lock POST/DELETE
  const invalidScoreSample = 5;                                 // 1 match for 0-invalid-score check
  const impersonationSample = 8;                                // 1 match for userId-ignored check
  const notAMemberSample = 12;                                  // 1 match for not-a-member check
  const visitorAdminSample = 18;                                // 1 match for VISITOR_ADMIN 403
  const pendingMemberSample = 22;                               // 1 match for PENDING 403
  const scoreCorrectionSample = 35;                             // 1 match to correct after scoring
  const midMatchJoinTarget = 20;                                // match during which mid-match joiners try
  const lateJoinAfter = 30;                                     // mid-tournament joiners join after this match

  let predictionsCreated = 0;
  let scoredCount = 0;
  let correctionNotifications = 0;

  for (let i = 0; i < groupStage.length; i++) {
    const m = groupStage[i];
    const kickoffMs = m.kickoff.getTime();
    const lockTimeMs = kickoffMs - 60 * 60 * 1000;

    // 6a. Advance to 2h before kickoff so predictions can be submitted
    await advanceSimTime(new Date(lockTimeMs - 60 * 60 * 1000));

    // 6b. Bulk insert predictions for this match
    const n = await generatePredictionsForMatch(m.id, m, approved);
    predictionsCreated += n;

    // 6c. Invalid score check (one match) — BEFORE lock
    if (m.matchNumber === invalidScoreSample) {
      const testUser = S.users.find((u) => u.persona === "completionist" && [0, 1].includes(S.users.indexOf(u)));
      // User 0 is in alpha; make sure they're an approved member
      const membership = await prisma.groupMembership.findFirst({
        where: { userId: S.users[0].id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
      });
      if (membership) {
        const j = await jarFor(S.users[0].email);
        const neg = await httpPost(j, "/api/predictions", { matchId: m.id, groupId: membership.groupId, homeScore: -1, awayScore: 0 });
        check(`M${m.matchNumber}: Negative score rejected (400)`, neg.status === 400, `status=${neg.status}`);
        const over = await httpPost(j, "/api/predictions", { matchId: m.id, groupId: membership.groupId, homeScore: 21, awayScore: 0 });
        check(`M${m.matchNumber}: Score >20 rejected (400)`, over.status === 400, `status=${over.status}`);
        const frac = await httpPost(j, "/api/predictions", { matchId: m.id, groupId: membership.groupId, homeScore: 1.5, awayScore: 0 });
        check(`M${m.matchNumber}: Non-integer score rejected (400)`, frac.status === 400, `status=${frac.status}`);
      }
    }

    // 6d. VISITOR_ADMIN cannot predict
    if (m.matchNumber === visitorAdminSample) {
      const vaUser = S.users[28]; // visitor-admin persona, in foxtrot as VISITOR_ADMIN
      const vaMembership = await prisma.groupMembership.findFirst({
        where: { userId: vaUser.id, memberRole: "VISITOR_ADMIN" },
      });
      if (vaMembership) {
        const vaJar = await jarFor(vaUser.email);
        const r = await httpPost(vaJar, "/api/predictions", { matchId: m.id, groupId: vaMembership.groupId, homeScore: 1, awayScore: 0 });
        check(`M${m.matchNumber}: VISITOR_ADMIN prediction POST rejected (403)`, r.status === 403, `status=${r.status}`);
      }
    }

    // 6e. PENDING member cannot predict
    if (m.matchNumber === pendingMemberSample) {
      const pendU = S.users[9]; // pending-only in alpha (assigned in phase 3)
      const pendMembership = await prisma.groupMembership.findFirst({ where: { userId: pendU.id, status: "PENDING" } });
      if (pendMembership) {
        const pj = await jarFor(pendU.email);
        const r = await httpPost(pj, "/api/predictions", { matchId: m.id, groupId: pendMembership.groupId, homeScore: 1, awayScore: 0 });
        check(`M${m.matchNumber}: PENDING member prediction rejected (403)`, r.status === 403, `status=${r.status}`);
      }
    }

    // 6f. Not-a-member cannot predict
    if (m.matchNumber === notAMemberSample) {
      const outsider = S.users[46]; // mid-tournament-joiner, not yet in any group
      const outsiderJar = await jarFor(outsider.email);
      const someGroup = S.groups[0];
      const r = await httpPost(outsiderJar, "/api/predictions", { matchId: m.id, groupId: someGroup.id, homeScore: 1, awayScore: 0 });
      check(`M${m.matchNumber}: Non-member prediction rejected (403)`, r.status === 403, `status=${r.status}`);
    }

    // 6g. Mid-match joiner: during match 20's pre-lock window, have them join a group and try to predict THIS match
    if (m.matchNumber === midMatchJoinTarget) {
      const midJoiner = S.users[7]; // persona: mid-match-joiner
      // Join via token into foxtrot
      const mj = await jarFor(midJoiner.email);
      const joinRes = await httpPost(mj, `/api/join/${S.groups.find(g => g.key === "foxtrot").joinToken}`, {});
      // They CAN still predict this match if lock hasn't started yet, but we'll re-check after lock
      if (joinRes.status !== 200) note(`Mid-match joiner ${midJoiner.email} failed to join: ${joinRes.status}`);
      approved = await loadApproved(); // refresh
    }

    // 6h. Impersonation — user sends prediction with a userId param that isn't theirs; server ignores it
    if (m.matchNumber === impersonationSample) {
      const attacker = S.users[0];
      const victim = S.users[1];
      const attackerMembership = await prisma.groupMembership.findFirst({
        where: { userId: attacker.id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
      });
      const aj = await jarFor(attacker.email);
      const before = await prisma.prediction.count({ where: { userId: victim.id, matchId: m.id } });
      // Attacker sends a POST pretending userId=victim (the API doesn't accept userId in body)
      await httpPost(aj, "/api/predictions", { matchId: m.id, groupId: attackerMembership.groupId, homeScore: 9, awayScore: 9, userId: victim.id });
      const afterVictim = await prisma.prediction.count({ where: { userId: victim.id, matchId: m.id } });
      const afterAttacker = await prisma.prediction.findFirst({ where: { userId: attacker.id, matchId: m.id, groupId: attackerMembership.groupId } });
      check(`M${m.matchNumber}: Impersonation attempt — prediction created under attacker's own userId only`,
        afterVictim === before && afterAttacker && afterAttacker.homeScore === 9 && afterAttacker.awayScore === 9,
        `victim.before=${before}, victim.after=${afterVictim}, attacker has 9-9 pred=${!!afterAttacker}`);
    }

    // 6i. Advance to lock time - 1 min (still unlocked)
    // Then to lock time, then test after-lock rejections
    if (lockCheckSamples.has(m.matchNumber)) {
      await advanceSimTime(new Date(lockTimeMs + 1));   // 1ms past lock
      // Pick a user who's a member; they try to predict
      const m0 = await prisma.groupMembership.findFirst({
        where: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" }, user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } },
      });
      if (m0) {
        const u = S.users.find((x) => x.id === m0.userId);
        const j = await jarFor(u.email);
        const postRes = await httpPost(j, "/api/predictions", { matchId: m.id, groupId: m0.groupId, homeScore: 9, awayScore: 9 });
        check(`M${m.matchNumber}: Post-lock POST prediction rejected (403)`, postRes.status === 403, `status=${postRes.status}, body=${JSON.stringify(postRes.body)}`);
        const delRes = await httpDelete(j, `/api/predictions?matchId=${m.id}&groupId=${m0.groupId}`);
        check(`M${m.matchNumber}: Post-lock DELETE prediction rejected (403)`, delRes.status === 403, `status=${delRes.status}`);
      }
    }

    // Mid-match joiner: try to predict match 20 after lock
    if (m.matchNumber === midMatchJoinTarget) {
      await advanceSimTime(new Date(lockTimeMs + 60_000)); // 1 min past lock
      const midJoiner = S.users[7];
      const mj = await jarFor(midJoiner.email);
      const foxtrotG = S.groups.find((g) => g.key === "foxtrot");
      const r = await httpPost(mj, "/api/predictions", { matchId: m.id, groupId: foxtrotG.id, homeScore: 1, awayScore: 1 });
      check(`M${m.matchNumber}: Mid-match joiner cannot predict locked match (403)`, r.status === 403, `status=${r.status}`);
    }

    // 6j. Advance to match end (kickoff + 2h) and set score
    const endTime = new Date(kickoffMs + 2 * 60 * 60 * 1000);
    await advanceSimTime(endTime);
    const [home, away] = pickMatchResult(m);
    await setMatchScore(m.id, home, away);
    S.simResults.set(m.id, [home, away]);
    scoredCount++;

    // 6k. Spot-check points calculated
    if ([1, 10, 36, 72].includes(m.matchNumber)) {
      const preds = await prisma.prediction.findMany({ where: { matchId: m.id }, take: 20 });
      const allScored = preds.every((p) => p.points !== null);
      const hasNonZero = preds.some((p) => (p.points ?? 0) > 0);
      check(`M${m.matchNumber}: All ${preds.length} predictions received points`, allScored, `preds=${preds.length}`);
      check(`M${m.matchNumber}: At least one prediction scored non-zero`, hasNonZero);
    }

    // 6l. Score correction — re-score with different values and verify notifications
    if (m.matchNumber === scoreCorrectionSample) {
      const [h2, a2] = [(home + 1) % 5, (away + 2) % 5];
      const notifsBefore = await prisma.notification.count({ where: { type: "score_corrected", matchId: m.id } });
      await setMatchScore(m.id, h2, a2);
      const notifsAfter = await prisma.notification.count({ where: { type: "score_corrected", matchId: m.id } });
      correctionNotifications = notifsAfter - notifsBefore;
      check(`M${m.matchNumber}: Score correction (${home}-${away}→${h2}-${a2}) generated ${correctionNotifications} notifications`,
        correctionNotifications > 0, `notifsBefore=${notifsBefore}, notifsAfter=${notifsAfter}`);
      const corrected = await prisma.prediction.findMany({ where: { matchId: m.id }, take: 5 });
      const allRescored = corrected.every((p) => p.points !== null);
      check(`M${m.matchNumber}: All predictions rescored after correction`, allRescored);
      S.simResults.set(m.id, [h2, a2]);
    }

    // 6m. Late joiner: after match `lateJoinAfter`, have them join & start predicting
    if (m.matchNumber === lateJoinAfter) {
      const lateIdxs = [6, 16, 26, 36, 46];
      const foxtrotG = S.groups.find((g) => g.key === "foxtrot");
      const echoG = S.groups.find((g) => g.key === "echo");
      for (const idx of lateIdxs) {
        const u = S.users[idx];
        const jr = await jarFor(u.email);
        await httpPost(jr, `/api/join/${foxtrotG.joinToken}`, {});
        await httpPost(jr, `/api/join/${echoG.joinToken}`, {});
      }
      approved = await loadApproved();
      const foxCount = await prisma.groupMembership.count({ where: { groupId: foxtrotG.id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } } });
      note(`After match ${lateJoinAfter}: 5 mid-tournament joiners added; foxtrot has ${foxCount} approved predictors`);
    }

    // Progress log
    if ((i + 1) % 12 === 0 || i + 1 === groupStage.length) {
      console.log(`   … ${i + 1}/${groupStage.length} group-stage matches processed (${predictionsCreated} predictions, ${scoredCount} scored)`);
    }
  }

  check(`Group stage complete: ${scoredCount}/72 matches scored, ${predictionsCreated} predictions written`, scoredCount === 72 && predictionsCreated > 3000);

  // Late joiner 0-points verification: mid-tournament-joiners should have 0 points for matches 1-30 (no predictions)
  const lateJoiner = S.users[6];
  const foxtrotG = S.groups.find((g) => g.key === "foxtrot");
  const earlyMatchIds = groupStage.slice(0, lateJoinAfter).map((m) => m.id);
  const earlyPoints = await prisma.prediction.aggregate({
    where: { userId: lateJoiner.id, matchId: { in: earlyMatchIds } },
    _sum: { points: true },
  });
  check(`Late joiner has 0 points for matches 1-${lateJoinAfter}`, (earlyPoints._sum.points ?? 0) === 0, `sum=${earlyPoints._sum.points}`);
  const latePreds = await prisma.prediction.count({ where: { userId: lateJoiner.id, matchId: { in: earlyMatchIds } } });
  check(`Late joiner has 0 predictions for matches 1-${lateJoinAfter}`, latePreds === 0, `count=${latePreds}`);
}

// ── Phase 7: Group stage advancement resolution ──────────────────────────────

async function phase7_advancementResolution() {
  phase("Phase 7 — Group stage advancement resolution (Jun 27)");

  const WC_GROUPS = {
    A: ["Mexico", "South Africa", "South Korea", "Czechia"],
    B: ["Canada", "Bosnia-Herzegovina", "Qatar", "Switzerland"],
    C: ["Brazil", "Morocco", "Haiti", "Scotland"],
    D: ["United States", "Paraguay", "Australia", "Turkey"],
    E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
    F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
    G: ["Belgium", "Egypt", "Iran", "New Zealand"],
    H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
    I: ["France", "Senegal", "Iraq", "Norway"],
    J: ["Austria", "Jordan", "Argentina", "Algeria"],
    K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
    L: ["England", "Croatia", "Ghana", "Panama"],
  };

  // Advance time to day after last group stage match
  await advanceSimTime("2026-06-27T23:00:00.000Z");

  // Compute standings per WC group based on simulated results
  const groupStage = S.allMatches.filter((m) => m.round === "Group Stage");
  // Refresh matches with scores
  const scored = await prisma.match.findMany({ where: { id: { in: groupStage.map((m) => m.id) } } });
  const byTeam = {}; // team → { pts, gf, ga }
  for (const m of scored) {
    if (m.homeScore == null) continue;
    byTeam[m.homeTeam] ??= { pts: 0, gf: 0, ga: 0, gd: 0 };
    byTeam[m.awayTeam] ??= { pts: 0, gf: 0, ga: 0, gd: 0 };
    byTeam[m.homeTeam].gf += m.homeScore;
    byTeam[m.homeTeam].ga += m.awayScore;
    byTeam[m.awayTeam].gf += m.awayScore;
    byTeam[m.awayTeam].ga += m.homeScore;
    if (m.homeScore > m.awayScore) byTeam[m.homeTeam].pts += 3;
    else if (m.homeScore < m.awayScore) byTeam[m.awayTeam].pts += 3;
    else { byTeam[m.homeTeam].pts += 1; byTeam[m.awayTeam].pts += 1; }
  }
  for (const t of Object.keys(byTeam)) byTeam[t].gd = byTeam[t].gf - byTeam[t].ga;

  // For each WC group, rank and assign result
  const resolutions = []; // [{team, result}]
  const thirdPlacers = []; // for global top-8 selection
  for (const [grp, teams] of Object.entries(WC_GROUPS)) {
    const ranked = [...teams].sort((a, b) => {
      const A = byTeam[a] ?? { pts: 0, gd: 0 };
      const B = byTeam[b] ?? { pts: 0, gd: 0 };
      return B.pts - A.pts || B.gd - A.gd;
    });
    resolutions.push({ team: ranked[0], result: "WINNER" });
    resolutions.push({ team: ranked[1], result: "RUNNER_UP" });
    thirdPlacers.push({ team: ranked[2], pts: byTeam[ranked[2]]?.pts ?? 0, gd: byTeam[ranked[2]]?.gd ?? 0 });
    resolutions.push({ team: ranked[3], result: "ELIMINATED" });
  }
  // Top 8 of 12 3rd-placers advance as THIRD; rest ELIMINATED
  thirdPlacers.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
  for (let i = 0; i < thirdPlacers.length; i++) {
    resolutions.push({ team: thirdPlacers[i].team, result: i < 8 ? "THIRD" : "ELIMINATED" });
  }

  // POST each via admin endpoint
  let ok = 0;
  for (const r of resolutions) {
    const res = await httpPost(S.adminJar, "/api/admin/advancement", r);
    if (res.status === 200) ok++;
  }
  check(`Advancement resolutions posted: ${ok}/${resolutions.length}`, ok === resolutions.length);

  // Verify AdvancementPrediction.points has been populated
  const scoredPreds = await prisma.advancementPrediction.count({ where: { points: { not: null } } });
  const totalPreds = await prisma.advancementPrediction.count();
  check(`All advancement predictions now scored: ${scoredPreds}/${totalPreds}`, scoredPreds === totalPreds && totalPreds > 0);

  // Sanity: pick a user, verify their winners' points match the group's exactMatchPoints
  const preds = await prisma.advancementPrediction.findMany({
    where: { pick: "WINNER" },
    include: { group: true },
    take: 20,
  });
  let correctScored = 0;
  let wrongDirection = 0;
  for (const p of preds) {
    const actual = resolutions.find((r) => r.team === p.team);
    if (!actual) continue;
    if (p.pick === actual.result) {
      if (p.points === p.group.exactMatchPoints) correctScored++;
    } else if (actual.result !== "ELIMINATED") {
      if (p.points === p.group.directionMatchPoints) wrongDirection++;
    }
  }
  check(`Advancement scoring matches rules (sample of WINNER picks: ${correctScored} exact, ${wrongDirection} direction)`, correctScored > 0);
}

// ── Phase 8: Knockout stages ──────────────────────────────────────────────

async function phase8_knockouts() {
  phase("Phase 8 — Knockouts (32 matches) with stage-specific scoring");

  const knockoutRounds = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Third Place Play-off", "Final"];
  const knockouts = S.allMatches.filter((m) => knockoutRounds.includes(m.round));
  check(`Knockout match count`, knockouts.length === 32, `got ${knockouts.length}`);

  async function loadApproved() {
    const rows = await prisma.groupMembership.findMany({
      where: {
        status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" },
        user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
        group: { name: { startsWith: "MegaSim:" } },
      },
      select: { userId: true, groupId: true, user: { select: { email: true } } },
    });
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.groupId)) map.set(r.groupId, []);
      const user = S.users.find((u) => u.email === r.user.email);
      if (user) map.get(r.groupId).push({ userId: r.userId, persona: user.persona, personaSpec: user.personaSpec });
    }
    return map;
  }

  const approved = await loadApproved();
  const bravoG = S.groups.find((g) => g.key === "bravo");
  let predictionsCreated = 0;
  let scoredCount = 0;

  // Sample match in each round to verify stage-specific scoring
  const sampleByRound = {};
  for (const m of knockouts) if (!sampleByRound[m.round]) sampleByRound[m.round] = m;

  for (let i = 0; i < knockouts.length; i++) {
    const m = knockouts[i];
    const kickoffMs = m.kickoff.getTime();
    const lockTimeMs = kickoffMs - 60 * 60 * 1000;

    await advanceSimTime(new Date(lockTimeMs - 60 * 60 * 1000));
    const n = await generatePredictionsForMatch(m.id, m, approved);
    predictionsCreated += n;

    // Pre-lock rule check on the very first knockout match
    if (m.matchNumber === 73) {
      // Verify that knockouts-only persona users now have predictions
      const kUser = S.users[5]; // knockouts-only persona
      const kPred = await prisma.prediction.findFirst({ where: { userId: kUser.id, matchId: m.id } });
      check(`M${m.matchNumber} (first knockout): knockouts-only persona now predicts`, !!kPred);
    }

    const endTime = new Date(kickoffMs + 2 * 60 * 60 * 1000);
    await advanceSimTime(endTime);
    const [home, away] = pickMatchResult(m);
    await setMatchScore(m.id, home, away);
    S.simResults.set(m.id, [home, away]);
    scoredCount++;

    // Stage-specific scoring verification: bravo group has custom boost for QF/SF/Final
    if (m.round === "Quarter-final" || m.round === "Semi-final" || m.round === "Final") {
      const bravoPreds = await prisma.prediction.findMany({
        where: { matchId: m.id, groupId: bravoG.id, points: { not: null } },
        take: 30,
      });
      const exactPreds = bravoPreds.filter((p) => p.homeScore === home && p.awayScore === away);
      if (exactPreds.length > 0) {
        const expectedExact = m.round === "Quarter-final" ? 8 : m.round === "Semi-final" ? 10 : m.round === "Final" ? 15 : null;
        if (expectedExact) {
          const actual = exactPreds[0].points;
          check(`M${m.matchNumber} (${m.round}): Bravo exact-match points = ${expectedExact}`,
            actual === expectedExact, `got ${actual} (expected ${expectedExact})`);
        }
      } else {
        note(`M${m.matchNumber} (${m.round}): No Bravo exact predictions to verify (score ${home}-${away})`);
      }
    }

    if ((i + 1) % 8 === 0 || i + 1 === knockouts.length) {
      console.log(`   … ${i + 1}/${knockouts.length} knockout matches processed`);
    }
  }

  check(`Knockouts complete: ${scoredCount}/32 matches scored, ${predictionsCreated} predictions written`, scoredCount === 32 && predictionsCreated > 500);
}

// ── Phase 9: Post-tournament day + final leaderboards ─────────────────────

async function phase9_postTournament() {
  phase("Phase 9 — Day after final (Jul 27) + final leaderboards");

  // Final is match 104 kickoff 2026-07-26T20:00Z, so advance to Jul 27 for "day after"
  await advanceSimTime("2026-07-27T12:00:00.000Z");

  // Test user cannot predict any match now — they're all past lock
  const testUser = S.users.find((u) => u.persona === "completionist");
  const tj = await jarFor(testUser.email);
  const anyApprovedG = await prisma.groupMembership.findFirst({
    where: { userId: testUser.id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
  });
  const m104 = S.allMatches.find((m) => m.matchNumber === 104);
  const r = await httpPost(tj, "/api/predictions", { matchId: m104.id, groupId: anyApprovedG.groupId, homeScore: 9, awayScore: 9 });
  check(`Post-tournament: prediction on match 104 rejected (403)`, r.status === 403, `status=${r.status}`);

  // Compute final leaderboard per group
  const groups = S.groups;
  const tableLines = [];
  for (const g of groups) {
    const lb = await prisma.groupMembership.findMany({
      where: { groupId: g.id, status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } },
      include: {
        user: {
          select: {
            id: true, name: true,
            predictions: { where: { groupId: g.id, points: { not: null } }, select: { points: true } },
            advancementPredictions: { where: { groupId: g.id, points: { not: null } }, select: { points: true } },
          },
        },
      },
    });
    const rows = lb.map((m) => ({
      name: m.user.name,
      matchPts: m.user.predictions.reduce((s, p) => s + p.points, 0),
      advPts: m.user.advancementPredictions.reduce((s, p) => s + p.points, 0),
    }));
    rows.forEach((row) => row.total = row.matchPts + row.advPts);
    rows.sort((a, b) => b.total - a.total);
    check(`${g.name}: final leaderboard computed (${rows.length} members)`, rows.length > 0);
    note(`${g.name} top 3: ${rows.slice(0, 3).map((r) => `${r.name}=${r.total}`).join(", ")}`);
    // Verify that total points > 0 for at least the winner
    check(`${g.name}: winner has non-zero points`, rows.length === 0 || rows[0].total > 0);
    tableLines.push({ group: g.name, top: rows.slice(0, 3), size: rows.length });
  }

  // Verify the /api/leaderboard endpoint returns something sane for each group
  const someUser = S.users[0];
  const uJar = await jarFor(someUser.email);
  const alphaG = groups.find((g) => g.key === "alpha");
  const lbRes = await httpGet(uJar, `/api/leaderboard?groupId=${alphaG.id}`);
  check(`/api/leaderboard returns array for alpha`, lbRes.status === 200 && Array.isArray(lbRes.body), `status=${lbRes.status}`);
  if (Array.isArray(lbRes.body) && lbRes.body.length > 0) {
    note(`alpha /api/leaderboard top: ${lbRes.body[0].name}=${lbRes.body[0].totalPoints ?? lbRes.body[0].points ?? "?"}`);
  }

  // Cross-group consistency: find a user in multiple groups and verify different total scores per group
  const multiGroupUser = await prisma.user.findFirst({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    include: { groupMemberships: { where: { status: "APPROVED", memberRole: { not: "VISITOR_ADMIN" } } } },
  });
  if (multiGroupUser && multiGroupUser.groupMemberships.length >= 2) {
    const groupPoints = [];
    for (const gm of multiGroupUser.groupMemberships) {
      const preds = await prisma.prediction.findMany({
        where: { userId: multiGroupUser.id, groupId: gm.groupId, points: { not: null } },
        select: { points: true },
      });
      groupPoints.push({ groupId: gm.groupId, sum: preds.reduce((s, p) => s + p.points, 0) });
    }
    const allSame = groupPoints.every((g) => g.sum === groupPoints[0].sum);
    check(`Cross-group scoring differs for same user (${multiGroupUser.name}): groups=${groupPoints.length}, sums=[${groupPoints.map(g => g.sum).join(",")}]`,
      !allSame || groupPoints[0].sum === 0, "stage-point overrides should produce different totals");
  }
}

// ── Phase 10: Cleanup notes (keep DB for inspection; user will restore) ──

async function phase10_cleanup() {
  phase("Phase 10 — Final tallies and notes");

  const counts = {
    users: await prisma.user.count({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } }),
    groups: await prisma.group.count({ where: { name: { startsWith: "MegaSim:" } } }),
    predictions: await prisma.prediction.count({ where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } } }),
    advancement: await prisma.advancementPrediction.count({ where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } } }),
    notifications: await prisma.notification.count({ where: { user: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } } }),
  };
  note(`Final tallies: ${JSON.stringify(counts)}`);
  note("DB will be restored from prisma/prisma/dev.db.bak-pre-simulation after this script completes.");
  note("TIME ZONES: The app does not implement per-user timezone preferences; all lockout/display times are UTC. " +
       "Users across UTC/PST/IST/JST experience identical lock behavior, which is correct given the current design.");
}

async function main() {
  try {
    await phase0_reset();
    await phase1_users();
    await phase2_groups();
    await phase3_joining();
    await phase4_advancement();
    await phase5_advancementLock();
    await phase6_groupStage();
    await phase7_advancementResolution();
    await phase8_knockouts();
    await phase9_postTournament();
    await phase10_cleanup();
    await writeReport();
  } catch (e) {
    fail(e);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main();
