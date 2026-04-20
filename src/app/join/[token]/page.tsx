"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface GroupInfo {
  groupId: string;
  groupName: string;
  description: string | null;
  memberCount: number;
}

type State = "loading" | "confirm" | "joining" | "joined" | "already" | "invalid" | "error" | "unauthenticated";

export default function JoinByLinkPage() {
  const { data: session, status } = useSession();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [group, setGroup] = useState<GroupInfo | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      try { sessionStorage.setItem("wc2026_join_token", token); } catch {}
      router.replace(`/login?callbackUrl=/join/${token}`);
      return;
    }

    fetch(`/api/join/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setState("invalid"); return; }
        setGroup(d);
        setState("confirm");
      })
      .catch(() => setState("error"));
  }, [session, status, token, router]);

  const handleJoin = async () => {
    setState("joining");
    try {
      const res = await fetch(`/api/join/${token}`, { method: "POST" });
      const d = await res.json();
      if (d.error === "invalid") { setState("invalid"); return; }
      if (d.error) { setState("error"); return; }
      setState(d.alreadyMember ? "already" : "joined");
    } catch {
      setState("error");
    }
  };

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <span className="inline-block w-6 h-6 border-2 border-gray-300 border-t-fifa-blue rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">🔗</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid or expired link</h1>
        <p className="text-gray-400 text-sm mb-6">This join link is no longer active. Ask the group admin for a new one.</p>
        <Link href="/groups" className="btn-primary">Browse Groups</Link>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-400 text-sm mb-6">Could not process your join request. Please try again.</p>
        <Link href="/groups" className="btn-primary">Browse Groups</Link>
      </div>
    );
  }

  if (state === "joined" || state === "already") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-5xl mb-4">⚽</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {state === "already" ? `You're already in ${group?.groupName}!` : `You've joined ${group?.groupName}!`}
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          {state === "already"
            ? "You're already an approved member of this group."
            : "You've been added as a member. Start predicting now!"}
        </p>
        {group?.groupId && (
          <Link href={`/groups/${group.groupId}`} className="btn-primary">Go to Group Dashboard</Link>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card text-center">
        <div className="w-16 h-16 rounded-full bg-fifa-blue text-white font-extrabold text-2xl flex items-center justify-center mx-auto mb-4">
          {group?.groupName.charAt(0).toUpperCase()}
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">You&apos;re invited!</h1>
        <p className="text-gray-500 text-sm mb-1">
          Join <strong className="text-gray-800">{group?.groupName}</strong>
        </p>
        {group?.description && (
          <p className="text-xs text-gray-400 mb-1">{group.description}</p>
        )}
        <p className="text-xs text-gray-400 mb-6">
          {group?.memberCount} {group?.memberCount === 1 ? "member" : "members"}
        </p>

        {state === "joining" ? (
          <div className="flex justify-center py-4">
            <span className="inline-block w-6 h-6 border-2 border-gray-300 border-t-fifa-blue rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button onClick={handleJoin} className="btn-primary w-full">
              Accept &amp; Join Group
            </button>
            <Link href="/groups" className="text-sm text-gray-400 hover:text-gray-600">
              Decline
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
