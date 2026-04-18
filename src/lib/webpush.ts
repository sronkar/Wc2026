import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let initialized = false;

function init() {
  if (initialized) return;
  if (!process.env.VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY === "placeholder") return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  initialized = true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  init();
  if (!initialized) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        // Remove stale subscriptions (410 Gone)
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    })
  );
}

export async function sendPushToAll(payload: PushPayload) {
  init();
  if (!initialized) return;

  const subs = await prisma.pushSubscription.findMany();
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    })
  );
}
