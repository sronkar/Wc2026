"use client";

import { useEffect, useState } from "react";

interface MatchLite {
  id: string;
  kickoff: string;
  status: string;
}

interface Props {
  matches: MatchLite[];
  onGo: (target: { tab?: "results" | "groups" | "users"; roundFilter?: string }) => void;
}

/**
 * Top-of-admin-panel action summary. Surfaces the three things an admin
 * most commonly needs to react to, so the first screen answers "what
 * should I look at now?" instead of dumping a 104-row table.
 *
 * - Pending join requests (count from /api/admin/pending-count)
 * - Matches overdue for a result (SCHEDULED but kickoff was ≥ 2h ago)
 * - Matches kicking off in the next 4 hours (nothing to do yet, but
 *   worth knowing)
 *
 * Each card is clickable only when its count is non-zero; it nudges the
 * admin to the right tab via onGo.
 */
export function AdminSummary({ matches, onGo }: Props) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/admin/pending-count")
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setPendingCount(d.count ?? 0); })
        .catch(() => { if (!cancelled) setPendingCount((c) => c ?? 0); });
    };
    load();
    // Refresh every 30s so a join request that arrives while the admin is
    // looking at this panel doesn't sit unseen until they reload the page.
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const now = Date.now();
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;
  const fourHoursAhead = now + 4 * 60 * 60 * 1000;

  const needsScoring = matches.filter((m) => {
    if (m.status !== "SCHEDULED") return false;
    return new Date(m.kickoff).getTime() <= twoHoursAgo;
  }).length;

  const upcomingSoon = matches.filter((m) => {
    if (m.status !== "SCHEDULED") return false;
    const k = new Date(m.kickoff).getTime();
    return k >= now && k <= fourHoursAhead;
  }).length;

  const allQuiet = pendingCount === 0 && needsScoring === 0 && upcomingSoon === 0;

  if (allQuiet && pendingCount !== null) {
    return (
      <div className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
        <span aria-hidden="true">✅</span>
        <span>Nothing needs your attention right now.</span>
      </div>
    );
  }

  return (
    <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StatCard
        icon="👥"
        count={pendingCount}
        label="Pending join requests"
        cta={pendingCount && pendingCount > 0 ? "Review →" : null}
        tone={pendingCount && pendingCount > 0 ? "warn" : "muted"}
        onClick={() => onGo({ tab: "groups" })}
      />
      <StatCard
        icon="📝"
        count={needsScoring}
        label="Matches overdue for a result"
        cta={needsScoring > 0 ? "Score now →" : null}
        tone={needsScoring > 0 ? "warn" : "muted"}
        onClick={() => onGo({ tab: "results" })}
      />
      <StatCard
        icon="⏰"
        count={upcomingSoon}
        label="Kicking off in the next 4 hours"
        cta={upcomingSoon > 0 ? "See schedule →" : null}
        tone={upcomingSoon > 0 ? "info" : "muted"}
        onClick={() => onGo({ tab: "results" })}
      />
    </div>
  );
}

function StatCard({
  icon, count, label, cta, tone, onClick,
}: {
  icon: string;
  count: number | null;
  label: string;
  cta: string | null;
  tone: "warn" | "info" | "muted";
  onClick: () => void;
}) {
  const toneWrap =
    tone === "warn" ? "border-amber-200 bg-amber-50/60" :
    tone === "info" ? "border-blue-200 bg-blue-50/40" :
    "border-gray-200 bg-white";
  const toneNumber =
    tone === "warn" ? "text-amber-700" :
    tone === "info" ? "text-blue-700" :
    "text-gray-400";
  const isInteractive = cta !== null;

  const Wrapper = isInteractive ? "button" : "div";

  return (
    <Wrapper
      onClick={isInteractive ? onClick : undefined}
      className={`text-left rounded-xl border p-4 transition ${toneWrap} ${
        isInteractive ? "hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-fifa-blue" : "cursor-default"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
        <span className={`text-2xl font-bold leading-none ${toneNumber}`}>
          {count === null ? "—" : count}
        </span>
      </div>
      <div className="mt-2">
        <p className="text-xs font-medium text-gray-700">{label}</p>
        {cta && <p className="text-[11px] text-fifa-blue mt-1">{cta}</p>}
      </div>
    </Wrapper>
  );
}
