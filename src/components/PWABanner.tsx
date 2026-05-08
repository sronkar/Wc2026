"use client";

import { useEffect, useState } from "react";

export function PWABanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already running as installed PWA — no banner needed
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Only show on mobile (iOS/Android)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    // Don't re-show if user dismissed this session
    if (sessionStorage.getItem("pwa-banner-dismissed")) return;

    setVisible(true);
  }, []);

  if (!visible) return null;

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div className="bg-fifa-blue text-white text-xs px-4 py-2.5 flex items-center gap-3">
      <span className="text-lg">⚽</span>
      <span className="flex-1">
        {isIOS
          ? <>Tap <strong>Share ⬆</strong> → <strong>Add to Home Screen</strong> for the best experience</>
          : <>Tap <strong>⋮ Menu</strong> → <strong>Add to Home Screen</strong> for the best experience</>
        }
      </span>
      <button
        onClick={() => { sessionStorage.setItem("pwa-banner-dismissed", "1"); setVisible(false); }}
        className="shrink-0 text-white/70 hover:text-white text-base leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
