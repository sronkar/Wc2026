/**
 * test-notification-deep-link.js
 *
 * Validates that lock_30m, join_approved, and result notifications store a
 * groupIds JSON array so the NotificationCenter can deep-link the user to
 * the right group (preserving current-group context when possible).
 *
 * The UI routing logic is pure client-side JS; we reimplement it here as a
 * small pure function to lock the contract.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `deeplink${STAMP}.test`;
const PASSWORD = "DeepLink2026!";

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

// Pure client-side routing logic under test. Must stay in sync with
// src/components/NotificationCenter.tsx::resolveHref.
function resolveHref(notif, currentPath) {
  let groupIds = [];
  if (notif.groupIds) {
    try { groupIds = JSON.parse(notif.groupIds); } catch {}
  }
  const matchFrag = notif.matchId ? `#match-${notif.matchId}` : "";
  if (groupIds.length === 0) return "/groups";
  const m = currentPath.match(/^\/groups\/([^/?#]+)/);
  const currentGroup = m?.[1];
  if (currentGroup && groupIds.includes(currentGroup)) {
    return `/groups/${currentGroup}${matchFrag}`;
  }
  return `/groups/${groupIds[0]}${matchFrag}`;
}

async function main() {
  console.log("── Setup ──");

  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `DeepLink${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `DL Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const user = await prisma.user.create({
    data: { email: `u@${EMAIL_DOMAIN}`, name: `DL User`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });
  const g1 = await prisma.group.create({ data: { name: `DeepLink${STAMP}: Office`, createdBy: admin.id } });
  const g2 = await prisma.group.create({ data: { name: `DeepLink${STAMP}: Family`, createdBy: admin.id } });
  await prisma.groupMembership.createMany({
    data: [
      { userId: user.id, groupId: g1.id, status: "APPROVED", memberRole: "MEMBER" },
      { userId: user.id, groupId: g2.id, status: "APPROVED", memberRole: "MEMBER" },
    ],
  });

  const adminJar = await signIn(admin.email, PASSWORD);
  try { await postSim(adminJar, "activate"); } catch {}

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── 1. lock_30m stores groupIds for unpredicted groups ──");
  {
    const match = await prisma.match.findFirst({ where: { isDemo: false }, orderBy: { matchNumber: "asc" } });
    await prisma.match.update({ where: { id: match.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
    await prisma.prediction.deleteMany({ where: { matchId: match.id, userId: user.id } });

    // User has predicted in G1 but not G2 → lock_30m should fire with groupIds=[g2.id]
    await prisma.prediction.create({
      data: { userId: user.id, matchId: match.id, groupId: g1.id, homeScore: 1, awayScore: 0 },
    });

    // Move virtual time into the lock_30m window (70-110 min before kickoff)
    const t = new Date(match.kickoff.getTime() - 90 * 60 * 1000);
    await postSim(adminJar, "setTime", { iso: t.toISOString() });

    const notif = await prisma.notification.findFirst({
      where: { userId: user.id, type: "lock_30m", matchId: match.id },
      orderBy: { createdAt: "desc" },
    });
    assert(!!notif, "lock_30m notification created for user");
    assert(!!notif?.groupIds, "groupIds field is populated on the notification");
    const parsed = notif?.groupIds ? JSON.parse(notif.groupIds) : [];
    assert(Array.isArray(parsed) && parsed.length === 1 && parsed[0] === g2.id,
      "groupIds is exactly [g2.id] (the unpredicted group)", `got ${JSON.stringify(parsed)}`);
    assert(notif?.matchId === match.id, "matchId is set on the notification");

    // Cleanup for this match
    await prisma.match.update({ where: { id: match.id }, data: { status: "SCHEDULED", homeScore: null, awayScore: null } });
    await prisma.prediction.deleteMany({ where: { matchId: match.id, userId: user.id } });
  }

  console.log("");
  console.log("── 2. Client-side resolveHref behaviour ──");
  {
    const matchId = "m-abc";
    // Both groups in the list, user is currently on /groups/G1 → stay on G1
    const nBoth = { groupIds: JSON.stringify([g1.id, g2.id]), matchId };
    assert(resolveHref(nBoth, `/groups/${g1.id}`) === `/groups/${g1.id}#match-${matchId}`,
      "currentPath in list → stay in current group + append match fragment");

    // Same notif, user is on /groups (no current group) → go to first group in list
    assert(resolveHref(nBoth, `/groups`) === `/groups/${g1.id}#match-${matchId}`,
      "no current group → first groupId in the list");

    // User is on /groups/UNRELATED → unrelated not in list → go to first
    assert(resolveHref(nBoth, `/groups/unrelated-id`) === `/groups/${g1.id}#match-${matchId}`,
      "current group not in list → first groupId in the list");

    // Only one group in list, user is on that group → stay there
    const nOne = { groupIds: JSON.stringify([g2.id]), matchId };
    assert(resolveHref(nOne, `/groups/${g2.id}`) === `/groups/${g2.id}#match-${matchId}`,
      "single-group notif while on that group → same group");

    // Only one group in list, user is on /groups → go to that one
    assert(resolveHref(nOne, `/groups`) === `/groups/${g2.id}#match-${matchId}`,
      "single-group notif from /groups → that group");

    // No matchId → no hash fragment appended
    const nNoMatch = { groupIds: JSON.stringify([g1.id]) };
    assert(resolveHref(nNoMatch, `/groups`) === `/groups/${g1.id}`,
      "no matchId → no hash fragment");

    // No groupIds at all → fall back to /groups
    const nEmpty = { groupIds: null, matchId };
    assert(resolveHref(nEmpty, `/groups/${g1.id}`) === `/groups`,
      "no groupIds → /groups fallback");

    // Malformed groupIds JSON → /groups fallback
    const nBad = { groupIds: "not-json", matchId };
    assert(resolveHref(nBad, `/groups/${g1.id}`) === `/groups`,
      "malformed groupIds → /groups fallback");
  }

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.prediction.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: `DeepLink${STAMP}:` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all DeepLink test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
