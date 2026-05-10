"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "wc2026:onboarding:first-group-visit:dismissed";

interface Props {
  userId: string;
  groupId: string;
  showForNewUsers: boolean; // server-computed: true when user has 0 predictions across all groups
}

export function FirstGroupVisitModal({
  userId,
  groupId,
  showForNewUsers,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [allowDirectAdd, setAllowDirectAdd] = useState(true);
  const [savingPref, setSavingPref] = useState(false);

  useEffect(() => {
    if (!showForNewUsers) return;
    try {
      const dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as Record<string, number>;
      if (!dismissed[userId]) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [userId, showForNewUsers]);

  // Load the user's current preference so the toggle reflects reality if they
  // re-open the modal after editing it elsewhere.
  useEffect(() => {
    if (!visible) return;
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.allowDirectAdd === "boolean") setAllowDirectAdd(d.allowDirectAdd);
      })
      .catch(() => {});
  }, [visible]);

  const toggleAllowDirectAdd = async (val: boolean) => {
    setAllowDirectAdd(val);
    setSavingPref(true);
    try {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowDirectAdd: val }),
      });
    } catch { /* non-fatal */ }
    setSavingPref(false);
  };

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
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4 py-8 overflow-y-auto"
      // Add notch + home-bar padding when the app is in standalone mode
      // (iPhone with the home indicator); on browser tabs both insets are 0.
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
      role="dialog" aria-modal="true" aria-labelledby="first-visit-title"
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="text-4xl mb-3 text-center">⚽</div>
          <h2 id="first-visit-title" className="text-xl font-bold text-gray-900 text-center mb-1">
            Welcome to SoccerPicks WC 2026
          </h2>
          <p className="text-sm text-gray-500 text-center mb-5">
            A few things to know before you start.
          </p>

          <div className="space-y-4">
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

          {/* Privacy preference — settable now, also editable later from Profile */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowDirectAdd}
                onChange={(e) => toggleAllowDirectAdd(e.target.checked)}
                disabled={savingPref}
                className="mt-0.5 rounded border-gray-300 text-fifa-blue focus:ring-fifa-blue"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">Allow group admins to add me directly</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When unchecked, admins must send you an invite link instead of adding you straight in. You can change this later in Profile.
                </p>
              </div>
            </label>
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
