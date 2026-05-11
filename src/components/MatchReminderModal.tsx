"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const STORAGE_KEY = "wc2026:match-reminder";

interface MatchReminderData {
  todayUnpredicted: number;
  tomorrowUnpredicted: number;
  serverNowMs: number;
  primaryGroupId: string | null;
}

interface StoredState {
  lastShownServerDay: string | null;
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

export function MatchReminderModal() {
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<MatchReminderData | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    const userId = session.user.id;

    fetch("/api/match-reminder")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MatchReminderData | null) => {
        if (!d || (d.todayUnpredicted === 0 && d.tomorrowUnpredicted === 0)) return;

        const stored = getStored(userId);
        const today = serverDayStr(d.serverNowMs);

        if (stored.lastShownServerDay === today) return;

        // Override snooze when there are unpredicted matches today — they could
        // lock any time and the LockBanner alone may not be enough.
        const urgentToday = d.todayUnpredicted > 0;
        if (stored.snoozeUntil > d.serverNowMs && !urgentToday) return;

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

  const href = data.primaryGroupId ? `/groups/${data.primaryGroupId}` : "/";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center px-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-reminder-title"
    >
      <div className="bg-white rounded-xl max-w-sm w-full shadow-xl p-5 mb-4 sm:mb-0">
        <div className="text-3xl text-center mb-2">⚽</div>
        <h2
          id="match-reminder-title"
          className="text-base font-bold text-gray-900 text-center mb-1"
        >
          Missing match predictions
        </h2>
        <p className="text-xs text-gray-500 text-center mb-4">
          Predictions lock 1 hour before kickoff — don&apos;t miss out!
        </p>

        <div className="space-y-2 mb-4">
          {data.todayUnpredicted > 0 && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              <span className="text-lg shrink-0 mt-0.5">🚨</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Urgent — today</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.todayUnpredicted === 1
                    ? "1 match today still without a prediction"
                    : `${data.todayUnpredicted} matches today still without predictions`}
                </p>
              </div>
            </div>
          )}

          {data.tomorrowUnpredicted > 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
              <span className="text-lg shrink-0 mt-0.5">📅</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Tomorrow</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.tomorrowUnpredicted === 1
                    ? "1 match tomorrow to predict"
                    : `${data.tomorrowUnpredicted} matches tomorrow to predict`}
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
          Predict now
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
