"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface GroupItem {
  id: string;
  name: string;
  avatar: string | null;
}

interface Props {
  activeGroupId: string;
  subPage?: string; // "matches" | "leaderboard" | undefined (dashboard)
}

export function GroupSwitcher({ activeGroupId, subPage }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupItem[]>([]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/user/groups")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setGroups(data); })
      .catch(() => {});
  }, [session?.user?.id]);

  if (groups.length <= 1) return null;

  const dest = (id: string) => subPage ? `/groups/${id}/${subPage}` : `/groups/${id}`;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {groups.map((g) => {
        const isActive = g.id === activeGroupId;
        return (
          <button
            key={g.id}
            onClick={() => { if (!isActive) router.push(dest(g.id)); }}
            className={`px-3 py-1 rounded-full text-sm font-medium transition border ${
              isActive
                ? "bg-fifa-blue text-white border-fifa-blue"
                : "bg-white text-gray-600 border-gray-300 hover:border-fifa-blue hover:text-fifa-blue"
            }`}
          >
            {g.name}
          </button>
        );
      })}
    </div>
  );
}
