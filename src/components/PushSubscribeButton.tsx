"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function PushSubscribeButton() {
  const { data: session } = useSession();
  const [state, setState] = useState<"unsupported" | "default" | "subscribed" | "loading">("unsupported");

  useEffect(() => {
    if (!session) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "default");
    });
  }, [session]);

  async function subscribe() {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY === "placeholder") {
      alert("Push notifications are not configured yet (VAPID keys missing).");
      return;
    }
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as unknown as ArrayBuffer,
      });
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState("subscribed");
    } catch {
      setState("default");
    }
  }

  async function unsubscribe() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("default");
    } catch {
      setState("subscribed");
    }
  }

  if (!session || state === "unsupported") return null;

  return (
    <button
      onClick={state === "subscribed" ? unsubscribe : subscribe}
      disabled={state === "loading"}
      className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border transition ${
        state === "subscribed"
          ? "border-green-300 text-green-700 bg-green-50 hover:bg-green-100"
          : "border-gray-200 text-gray-600 hover:border-fifa-blue hover:text-fifa-blue"
      }`}
    >
      {state === "loading" ? (
        "…"
      ) : state === "subscribed" ? (
        <>🔔 Notifications on</>
      ) : (
        <>🔕 Enable notifications</>
      )}
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}
