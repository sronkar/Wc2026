"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "wc2026:onboarding:first-group-visit:dismissed";

interface Props {
  userId: string;
  groupId: string;
  showForNewUsers: boolean; // server-computed: true when user has 0 predictions across all groups
  defaultExactPoints: number;
  defaultDirectionPoints: number;
}

/**
 * Welcome dialog shown on a user's very first visit to a group dashboard
 * (they haven't predicted anything yet). Explains the scoring rules, the
 * 60-minute prediction lock, and where to find advancement picks.
 *
 * Dismissal is persisted per-user in localStorage — server-side state
 * would need a new DB column for essentially no benefit.
 */
export function FirstGroupVisitModal({
  userId,
  groupId,
  showForNewUsers,
  defaultExactPoints,
  defaultDirectionPoints,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!showForNewUsers) return;
    try {
      const dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as Record<string, number>;
      if (!dismissed[userId]) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [userId, showForNewUsers]);

  const dismiss = () => {
    try {
      const prior = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as Record<string, number>;
      prior[userId] = Date.now();
      localStorage.setItem(DISMISS_KEY, JSON.stringify(prior));
    } catch { /* non-fatal */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4 py-8 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="first-visit-title">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="text-4xl mb-3 text-center">⚽</div>
          <h2 id="first-visit-title" className="text-xl font-bold text-gray-900 text-center mb-1">
            Welcome to WC2026 Predictions
          </h2>
          <p className="text-sm text-gray-500 text-center mb-5">
            A few things to know before you start.
          </p>

          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="text-xl shrink-0">🎯</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Scoring</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  <strong>{defaultExactPoints} points</strong> for an exact score.
                  <strong> {defaultDirectionPoints} point{defaultDirectionPoints === 1 ? "" : "s"}</strong> for picking the right winner (or draw) even if the score is off.
                  Your group may boost points for later rounds — check the group settings.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="text-xl shrink-0">⏰</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">1-hour lock</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Predictions for a match lock <strong>60 minutes before kickoff</strong>. After that you can&apos;t edit or submit.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="text-xl shrink-0">🏆</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Group-stage picks</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  There&apos;s a separate screen for predicting which teams finish 1st / 2nd / 3rd of each WC group. Those lock before the tournament starts — don&apos;t miss them.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="text-xl shrink-0">👥</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">You can be in multiple groups</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Your predictions are scored independently per group, so different leagues can have different point rules.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <Link
              href={`/groups/${groupId}/advancement`}
              onClick={dismiss}
              className="flex-1 btn-secondary text-center text-sm py-2.5"
            >
              Set group-stage picks
            </Link>
            <button
              onClick={dismiss}
              className="flex-1 btn-primary text-sm py-2.5"
            >
              Start predicting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
