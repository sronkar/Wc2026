"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on every page load. Previously the service worker was only
 * registered as a side-effect of clicking "Enable push notifications" in
 * PushSubscribeButton — meaning users who never opted into push had no SW
 * installed, and "Add to Home Screen" produced a non-PWA WebClip on iOS.
 *
 * Now: SW registers unconditionally on mount, every page. Push subscribe
 * still works as before (it'll find the existing registration). The SW only
 * does push handling today, but having it installed is the prerequisite for
 * any future offline shell or background sync.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Don't register in dev; Next.js sometimes serves stale SW content during HMR
    // and the resulting "loop" is more pain than value. Production only.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed:", err);
    });
  }, []);
  return null;
}
