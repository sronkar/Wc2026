"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { EmptyState } from "@/components/ui/EmptyState";

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  matchId: string | null;
  groupIds: string | null; // JSON-encoded string[] or null
  read: boolean;
  createdAt: string;
}

/**
 * Resolve a click on a notification to a destination URL.
 *
 * Preserve context: if the user is already on /groups/X and X is one of the
 * notification's relevant groups, stay in X (and scroll to the match if any).
 * Otherwise pick the first group from the list. Fall back to /groups.
 */
function resolveHref(n: AppNotification, currentPath: string): string {
  let groupIds: string[] = [];
  if (n.groupIds) {
    try { groupIds = JSON.parse(n.groupIds) as string[]; } catch {}
  }
  const matchFrag = n.matchId ? `#match-${n.matchId}` : "";

  if (groupIds.length === 0) return "/groups";

  const m = currentPath.match(/^\/groups\/([^/?#]+)/);
  const currentGroup = m?.[1];
  if (currentGroup && groupIds.includes(currentGroup)) {
    return `/groups/${currentGroup}${matchFrag}`;
  }

  return `/groups/${groupIds[0]}${matchFrag}`;
}

export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 transition"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1rem))] bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-fifa-blue hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <EmptyState
                icon="🔕"
                title="No notifications yet"
                description="We'll ping you when a match is about to lock or a result is in."
                className="py-6"
              />
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    const href = resolveHref(n, window.location.pathname);
                    router.push(href);
                  }}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition ${n.read ? "" : "bg-blue-50/60"}`}
                >
                  <div className="pt-0.5 shrink-0 text-base">{typeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${n.read ? "text-gray-700" : "text-gray-900 font-medium"}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-gray-300 mt-1">{relativeTime(n.createdAt)}</p>
                  </div>
                  {!n.read && (
                    <div className="shrink-0 mt-1.5">
                      <div className="w-2 h-2 rounded-full bg-fifa-blue" />
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function typeIcon(type: string): string {
  if (type === "lock_1h") return "🔒";
  if (type === "lock_30m") return "⏰";
  if (type === "result") return "⚽";
  if (type === "score_corrected") return "📝";
  if (type === "join_approved") return "🎉";
  return "🔔";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
