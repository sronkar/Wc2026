"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const STORAGE_KEY = "wc2026:pred-reminder";

interface ReminderData {
  hasAnything: boolean;
  unfilledGlobalCount: number;
  earliestGlobalLockTime: string | null;
  incompleteAdvancementGroupCount: number;
  advancementLockTime: string;
  advancementLocked: boolean;
  primaryGroupId: string | null;
  serverNowMs: number;
}

interface StoredState {
  // "YYYY-MM-DD" in virtual server time — resets when server date advances
  lastShownServerDay: string | null;
  // Expiry stored as virtual server-time ms so advancing sim time ages the snooze
  snoozeUntil: number;
}

function getStored(userId: string): StoredState {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as StoredState) : { lastShownServerDay: null, snoozeUntil: 0 };
  } catch {
    return { lastShownServerDay: null, snoozeUntil: 0 };
  }
}

function setStored(userId: string, state: StoredState) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(state));
  } catch { /* non-fatal */ }
}

function serverDayStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isoDay(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function formatLock(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function PredictionReminderModal() {
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<ReminderData | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    const userId = session.user.id;

    fetch("/api/prediction-reminder")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ReminderData | null) => {
        if (!d?.hasAnything) return;

        const stored = getStored(userId);
        const today = serverDayStr(d.serverNowMs);

        // Already shown today in server/virtual time
        if (stored.lastShownServerDay === today) return;

        // Determine if any unfilled item locks today (overrides snooze)
        const advLockDay =
          !d.advancementLocked &&
          d.incompleteAdvancementGroupCount > 0 &&
          isoDay(d.advancementLockTime) === today;
        const globalLockDay =
          d.unfilledGlobalCount > 0 && isoDay(d.earliestGlobalLockTime) === today;
        const isAnyLockDay = advLockDay || globalLockDay;

        // Respect snooze (compared in server/virtual time) unless it's lock day
        if (stored.snoozeUntil > d.serverNowMs && !isAnyLockDay) return;

        setStored(userId, { lastShownServerDay: today, snoozeUntil: stored.snoozeUntil });
        setData(d);
        setVisible(true);
      })
      .catch(() => {});
  }, [status, session?.user?.id]);

  const dismiss = () => setVisible(false);

  const remindTomorrow = () => {
    if (!session?.user?.id || !data) return;
    const tomorrowStart = new Date(data.serverNowMs);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    tomorrowStart.setUTCHours(0, 0, 0, 0);
    setStored(session.user.id, {
      lastShownServerDay: serverDayStr(data.serverNowMs),
      snoozeUntil: tomorrowStart.getTime(),
    });
    setVisible(false);
  };

  const snooze = () => {
    if (!session?.user?.id || !data) return;
    setStored(session.user.id, {
      lastShownServerDay: serverDayStr(data.serverNowMs),
      snoozeUntil: data.serverNowMs + 3 * 24 * 60 * 60 * 1000,
    });
    setVisible(false);
  };

  if (!visible || !data) return null;

  const href =
    data.primaryGroupId
      ? data.incompleteAdvancementGroupCount > 0
        ? `/groups/${data.primaryGroupId}/advancement`
        : `/groups/${data.primaryGroupId}`
      : "/";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center px-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pred-reminder-title"
    >
      <div className="bg-white rounded-xl max-w-sm w-full shadow-xl p-5 mb-4 sm:mb-0">
        <div className="text-3xl text-center mb-2">⏳</div>
        <h2
          id="pred-reminder-title"
          className="text-base font-bold text-gray-900 text-center mb-1"
        >
          Pre-tournament picks still open
        </h2>
        <p className="text-xs text-gray-500 text-center mb-4">
          These carry heavy point weight — don&apos;t miss the deadline!
        </p>

        <div className="space-y-2 mb-4">
          {data.incompleteAdvancementGroupCount > 0 && !data.advancementLocked && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
              <span className="text-lg shrink-0 mt-0.5">🏆</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Group stage advancement picks</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.incompleteAdvancementGroupCount === 1
                    ? "1 group incomplete"
                    : `${data.incompleteAdvancementGroupCount} groups incomplete`}
                  {" · "}Locks {formatLock(data.advancementLockTime)}
                </p>
              </div>
            </div>
          )}

          {data.unfilledGlobalCount > 0 && data.earliestGlobalLockTime && (
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <span className="text-lg shrink-0 mt-0.5">🌍</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Global predictions</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.unfilledGlobalCount === 1
                    ? "1 unanswered"
                    : `${data.unfilledGlobalCount} unanswered`}
                  {" · "}First locks {formatLock(data.earliestGlobalLockTime)}
                </p>
              </div>
            </div>
          )}
        </div>

        <Link
          href={href}
          onClick={dismiss}
          className="block w-full text-sm font-semibold text-white bg-fifa-blue hover:bg-blue-700 rounded-lg py-2.5 text-center transition mb-2"
        >
          Fill them in
        </Link>
        <div className="flex gap-2">
          <button
            onClick={remindTomorrow}
            className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition"
          >
            Tomorrow
          </button>
          <button
            onClick={snooze}
            className="flex-1 text-sm text-gray-500 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition"
          >
            Snooze 3 days
          </button>
        </div>
      </div>
    </div>
  );
}
