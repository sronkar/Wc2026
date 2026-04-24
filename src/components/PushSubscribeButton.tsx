"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type ButtonState =
  | "unsupported"   // browser has no Push API at all (e.g. Firefox iOS)
  | "needs-a2hs"    // iOS Safari, in-tab — push can never work until added to home screen
  | "default"       // ready to subscribe
  | "subscribed"
  | "loading";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ reports as Mac in the UA — also check touch + platform.
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari sets navigator.standalone; modern browsers expose display-mode.
  // @ts-expect-error iOS-specific property not in TS lib
  if (window.navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function PushSubscribeButton() {
  const { data: session } = useSession();
  const [state, setState] = useState<ButtonState>("unsupported");
  const [showA2HSHelp, setShowA2HSHelp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    if (typeof window === "undefined") return;

    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;

    if (!hasSW || !hasPush) {
      setState("unsupported");
      return;
    }

    // iOS Safari only allows push when the app is launched from the home screen
    // in standalone mode. In a regular browser tab, pushManager.subscribe()
    // throws and there's no way to recover. Surface a guided "Add to Home
    // Screen" affordance instead of letting the click fail silently.
    if (isIOS() && !isStandalone()) {
      setState("needs-a2hs");
      return;
    }

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "default");
    }).catch(() => {
      setState("default");
    });
  }, [session]);

  async function subscribe() {
    setErrorMsg(null);
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY === "placeholder") {
      setErrorMsg("Push notifications are not configured yet (VAPID keys missing).");
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
    } catch (err) {
      // Surface the actual reason to the user instead of silently reverting.
      setState("default");
      setErrorMsg(err instanceof Error ? err.message : "Couldn't enable notifications.");
    }
  }

  async function unsubscribe() {
    setErrorMsg(null);
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

  if (state === "needs-a2hs") {
    return (
      <div className="relative">
        <button
          onClick={() => setShowA2HSHelp((v) => !v)}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition"
        >
          📲 Notifications on iPhone
        </button>
        {showA2HSHelp && (
          <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1rem))] bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-4 text-sm text-gray-700 space-y-2">
            <p className="font-semibold text-gray-900">To enable notifications on iPhone</p>
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li>Tap the <strong>Share</strong> button at the bottom of Safari (the square with an up-arrow).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Open WC2026 from your home screen — you&apos;ll see this button again, and it&apos;ll work this time.</li>
            </ol>
            <p className="text-[11px] text-gray-400 mt-2">
              Apple only allows web push from installed PWAs. Sorry — not our rule.
            </p>
            <button
              onClick={() => setShowA2HSHelp(false)}
              className="text-xs text-fifa-blue hover:underline"
            >
              Got it
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
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
      {errorMsg && (
        <p className="absolute right-0 top-full mt-1 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 max-w-[14rem]">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}
