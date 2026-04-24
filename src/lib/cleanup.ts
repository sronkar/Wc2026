import { prisma } from "@/lib/prisma";

/**
 * Delete rows from tables that grow unbounded.
 *
 * - MatchReminder: one row per (user, match) reminder sent. Only useful for
 *   dedup within the same reminder window. Anything older than 30 days has
 *   no remaining purpose.
 * - Notification: in-app feed rows. Keep unread forever (the user hasn't
 *   acknowledged them). Read rows older than 14 days can go — users don't
 *   scroll back that far in the notification center.
 * - Notification (post_game_email sentinel): internal dedup to prevent
 *   re-sending the blast on score corrections. A match is effectively
 *   settled 30 days after kickoff; keeping the sentinel longer is dead weight.
 *
 * Returns counts for logging / admin visibility.
 */

export interface CleanupResult {
  matchRemindersDeleted: number;
  notificationsReadDeleted: number;
  notificationSentinelsDeleted: number;
}

const MATCH_REMINDER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NOTIFICATION_READ_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const NOTIFICATION_SENTINEL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function cleanupStaleNotifications(now: Date = new Date()): Promise<CleanupResult> {
  const matchReminderCutoff = new Date(now.getTime() - MATCH_REMINDER_TTL_MS);
  const notifReadCutoff = new Date(now.getTime() - NOTIFICATION_READ_TTL_MS);
  const notifSentinelCutoff = new Date(now.getTime() - NOTIFICATION_SENTINEL_TTL_MS);

  const [mr, nRead, nSentinel] = await Promise.all([
    prisma.matchReminder.deleteMany({ where: { sentAt: { lt: matchReminderCutoff } } }),
    prisma.notification.deleteMany({
      where: { read: true, createdAt: { lt: notifReadCutoff }, type: { notIn: ["post_game_email"] } },
    }),
    prisma.notification.deleteMany({
      where: { type: "post_game_email", createdAt: { lt: notifSentinelCutoff } },
    }),
  ]);

  return {
    matchRemindersDeleted: mr.count,
    notificationsReadDeleted: nRead.count,
    notificationSentinelsDeleted: nSentinel.count,
  };
}
