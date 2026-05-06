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
    // Cache-bust the SW URL with the build timestamp so a deploy invalidates
    // the cached worker on the next visit. Without this, browsers happily
    // re-use the old /sw.js for up to 24h after deploy. The Cache-Control
    // header in next.config also enforces no-cache on /sw.js — belt + suspenders.
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "1";
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId)}`).catch((err) => {
      console.warn("[sw] registration failed:", err);
    });
  }, []);
  return null;
}
