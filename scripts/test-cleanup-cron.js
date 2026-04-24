/**
 * test-cleanup-cron.js
 *
 * Seeds MatchReminder + Notification rows at varying ages and invokes the
 * /api/admin/cleanup endpoint (which calls cleanupStaleNotifications).
 * Asserts: old rows are pruned per TTL; fresh rows remain; unread are
 * never pruned; post_game_email sentinels have their own 30d TTL.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const STAMP = Date.now();
const EMAIL_DOMAIN = `cleanup${STAMP}.test`;
const PASSWORD = "Cleanup2026!";

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
function mark(n, ok, d = "") { console.log(`${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`); return ok; }

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function main() {
  console.log("── Setup ──");

  await prisma.matchReminder.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.create({
    data: { email: `admin@${EMAIL_DOMAIN}`, name: `CL Admin`, role: "ADMIN", password: hash, emailVerified: new Date(), isDemo: false },
  });
  const user = await prisma.user.create({
    data: { email: `u@${EMAIL_DOMAIN}`, name: `CL User`, password: hash, emailVerified: new Date(), isDemo: false, role: "USER" },
  });

  const someMatch = await prisma.match.findFirst({ where: { isDemo: false } });
  const mId = someMatch.id;

  // ── Seed data ───────────────────────────────────────────────────────────
  // MatchReminders: 3 old (>30d), 2 fresh (<30d) — admin + user × mix
  // We'll just create them as admin with different sentAt.
  await prisma.matchReminder.createMany({
    data: [
      { userId: user.id, matchId: mId, sentAt: daysAgo(35) },
      { userId: admin.id, matchId: mId, sentAt: daysAgo(45) },
    ],
  });
  // A single-user fresh reminder (use a different userId to avoid unique-key conflicts on (userId, matchId))
  await prisma.matchReminder.create({
    data: { userId: user.id, matchId: mId, sentAt: daysAgo(5) },
  }).catch(() => {}); // if the unique constraint catches it, the seed above already covers user.id
  // Reset above to be clean: delete the old reminder for user.id and put the 5-days-old one in its place
  await prisma.matchReminder.deleteMany({ where: { userId: user.id, matchId: mId } });
  await prisma.matchReminder.create({
    data: { userId: user.id, matchId: mId, sentAt: daysAgo(35) }, // old
  });

  // For the "fresh" reminder, use a different match if available
  const freshMatch = await prisma.match.findFirst({ where: { isDemo: false, id: { not: mId } } });
  const freshMid = freshMatch?.id ?? mId;
  if (freshMid !== mId) {
    await prisma.matchReminder.create({ data: { userId: user.id, matchId: freshMid, sentAt: daysAgo(5) } });
  }

  // Notifications: mix of read/unread + old/fresh + post_game_email sentinels
  await prisma.notification.createMany({
    data: [
      { userId: user.id, type: "lock_30m", title: "old read", body: "x", read: true, createdAt: daysAgo(20), matchId: mId },
      { userId: user.id, type: "result", title: "old read 2", body: "x", read: true, createdAt: daysAgo(30), matchId: mId },
      { userId: user.id, type: "result", title: "fresh read", body: "x", read: true, createdAt: daysAgo(5), matchId: mId },
      { userId: user.id, type: "lock_30m", title: "OLD UNREAD (should survive)", body: "x", read: false, createdAt: daysAgo(90), matchId: mId },
      { userId: user.id, type: "result", title: "fresh unread", body: "x", read: false, createdAt: daysAgo(2), matchId: mId },
      { userId: admin.id, type: "post_game_email", title: "old sentinel", body: "x", read: true, createdAt: daysAgo(45), matchId: mId },
      { userId: admin.id, type: "post_game_email", title: "fresh sentinel", body: "x", read: true, createdAt: daysAgo(10), matchId: mId },
    ],
  });

  // Snapshot BEFORE cleanup
  const mrBefore = await prisma.matchReminder.count({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  const nBefore = await prisma.notification.count({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  console.log(`   before: ${mrBefore} MatchReminders, ${nBefore} Notifications seeded for cleanup${STAMP}`);

  const adminJar = await signIn(admin.email, PASSWORD);
  const res = await fetch2(adminJar, "/api/admin/cleanup", { method: "POST" });
  const body = await res.json();
  console.log(`   cleanup returned:`, body);

  let pass = 0, fail = 0;
  const assert = (c, n, d = "") => { (c ? pass++ : fail++); mark(n, c, d); };

  console.log("");
  console.log("── Assertions ──");

  // MatchReminder: old (>30d) gone, fresh (5d) stays
  const mrAfter = await prisma.matchReminder.findMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  const mrOldRemain = mrAfter.filter((r) => r.sentAt < daysAgo(30).getTime()).length;
  assert(mrOldRemain === 0, `No old MatchReminders remain (>30d)`, `got ${mrOldRemain}`);
  if (freshMid !== mId) {
    const mrFresh = mrAfter.find((r) => r.matchId === freshMid);
    assert(!!mrFresh, `Fresh MatchReminder (5d) still present`);
  }

  // Notifications for our user
  const notifs = await prisma.notification.findMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } }, orderBy: { createdAt: "asc" } });
  const byTitle = Object.fromEntries(notifs.map((n) => [n.title, n]));

  assert(!byTitle["old read"], "Old read notification (20d) pruned");
  assert(!byTitle["old read 2"], "Old read notification (30d) pruned");
  assert(!!byTitle["fresh read"], "Fresh read notification (5d) kept");
  assert(!!byTitle["OLD UNREAD (should survive)"], "Old UNREAD notification (90d) survived — unread are never pruned");
  assert(!!byTitle["fresh unread"], "Fresh unread notification (2d) kept");
  assert(!byTitle["old sentinel"], "Old post_game_email sentinel (45d) pruned");
  assert(!!byTitle["fresh sentinel"], "Fresh post_game_email sentinel (10d) kept");

  // Counts in response match what we observed
  const freshSentinel = notifs.find((n) => n.title === "fresh sentinel");
  const freshRead = notifs.find((n) => n.title === "fresh read");
  const freshUnread = notifs.find((n) => n.title === "fresh unread");
  const oldUnreadSurvived = notifs.find((n) => n.title === "OLD UNREAD (should survive)");
  assert(body.matchRemindersDeleted >= 2, `Response reports ≥2 MatchReminders deleted`, `got ${body.matchRemindersDeleted}`);
  assert(body.notificationsReadDeleted === 2, `Response reports 2 read Notifications deleted`, `got ${body.notificationsReadDeleted}`);
  assert(body.notificationSentinelsDeleted === 1, `Response reports 1 sentinel deleted`, `got ${body.notificationSentinelsDeleted}`);

  console.log("");
  console.log(`── Summary: ${pass} pass, ${fail} fail ──`);

  console.log("");
  console.log("── Cleanup ──");
  await prisma.matchReminder.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log("   removed all cleanup-test data");

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
