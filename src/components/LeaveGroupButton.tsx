"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  groupId: string;
  groupName: string;
}

export function LeaveGroupButton({ groupId, groupName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleLeave = async () => {
    if (!confirm(
      `Leave "${groupName}"?\n\nYour predictions stay in the leaderboard history but you won't be able to predict in this group anymore. You can rejoin if invited.`,
    )) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/leave`, { method: "POST" });
      if (res.ok) {
        router.replace("/groups");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to leave group");
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLeave}
        disabled={busy}
        className="text-xs text-gray-400 hover:text-red-500 transition disabled:opacity-40"
      >
        {busy ? "Leaving…" : "Leave group"}
      </button>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  );
}
