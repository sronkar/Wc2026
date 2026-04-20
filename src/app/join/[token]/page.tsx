"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type State = "loading" | "joining" | "joined" | "already" | "invalid" | "error" | "unauthenticated";

export default function JoinByLinkPage() {
  const { data: session, status } = useSession();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      // Save token in sessionStorage so we can resume after sign-in
      try { sessionStorage.setItem("wc2026_join_token", token); } catch {}
      router.replace(`/login?callbackUrl=/join/${token}`);
      return;
    }

    setState("joining");
    fetch(`/api/join/${token}`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error === "invalid") { setState("invalid"); return; }
        if (d.error) { setState("error"); return; }
        setGroupName(d.groupName ?? "");
        setGroupId(d.groupId ?? "");
        setState(d.alreadyMember ? "already" : "joined");
      })
      .catch(() => setState("error"));
  }, [session, status, token, router]);

  if (state === "loading" || state === "joining") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <span className="inline-block w-6 h-6 border-2 border-gray-300 border-t-fifa-blue rounded-full animate-spin" />
        Joining group…
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

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <p className="text-5xl mb-4">⚽</p>
      <h1 className="text-xl font-bold text-gray-900 mb-2">
        {state === "already" ? `You're already in ${groupName}!` : `You've joined ${groupName}!`}
      </h1>
      <p className="text-gray-400 text-sm mb-6">
        {state === "already"
          ? "You're already an approved member of this group."
          : "You've been added as a member. Start predicting now!"}
      </p>
      {groupId && (
        <Link href={`/groups/${groupId}`} className="btn-primary">Go to Group Dashboard</Link>
      )}
    </div>
  );
}
