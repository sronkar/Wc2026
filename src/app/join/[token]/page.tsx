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

export default function JoinByLinkPage() {
  const { data: session, status } = useSession();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loadError, setLoadError] = useState("");

  // Form fields (unauthenticated join)
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Authenticated join state
  const [autoJoining, setAutoJoining] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);

  // Load group info (no auth required)
  useEffect(() => {
    fetch(`/api/join/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setLoadError("This join link is invalid or expired."); return; }
        setGroup(d);
      })
      .catch(() => setLoadError("Could not load group info."));
  }, [token]);

  // Signed-in users: auto-join immediately
  useEffect(() => {
    if (!group || status === "loading" || !session) return;
    setAutoJoining(true);
    fetch(`/api/join/${token}`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error === "invalid") { setLoadError("This join link is invalid or expired."); return; }
        if (d.error) { setJoinError("Something went wrong."); return; }
        setAlreadyMember(!!d.alreadyMember);
        setDone(true);
      })
      .catch(() => setJoinError("Something went wrong."))
      .finally(() => setAutoJoining(false));
  }, [group, session, status, token]);

  // Instant join for unauthenticated users: email + name → session cookie → redirect
  const handleInstantJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setJoinError("");
    const res = await fetch(`/api/join/${token}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      setJoinError(data.error ?? "Something went wrong");
      setJoining(false);
      return;
    }
    router.push(`/groups/${data.groupId}`);
  };

  if (loadError) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">🔗</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid or expired link</h1>
        <p className="text-gray-400 text-sm mb-6">{loadError}</p>
        <Link href="/groups" className="btn-primary">Browse Groups</Link>
      </div>
    );
  }

  if (!group || status === "loading" || autoJoining) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <span className="inline-block w-6 h-6 border-2 border-gray-300 border-t-fifa-blue rounded-full animate-spin" />
        {autoJoining ? "Joining group…" : "Loading…"}
      </div>
    );
  }

  // Authenticated + done
  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-5xl mb-4">⚽</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {alreadyMember ? `You're already in ${group.groupName}!` : `You've joined ${group.groupName}!`}
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          {alreadyMember ? "You're already an approved member." : "You're in! Start predicting now."}
        </p>
        <Link href={`/groups/${group.groupId}`} className="btn-primary">Go to Group Dashboard</Link>
      </div>
    );
  }

  // Unauthenticated: show join form
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card text-center">
        <div className="w-16 h-16 rounded-full bg-fifa-blue text-white font-extrabold text-2xl flex items-center justify-center mx-auto mb-4">
          {group.groupName.charAt(0).toUpperCase()}
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Join {group.groupName}</h1>
        {group.description && (
          <p className="text-gray-500 text-sm mb-1">{group.description}</p>
        )}
        <p className="text-xs text-gray-400 mb-6">{group.memberCount} member{group.memberCount !== 1 ? "s" : ""}</p>

        <form onSubmit={handleInstantJoin} className="text-left space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
              autoComplete="name"
              maxLength={80}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
          </div>
          {joinError && <p className="text-sm text-red-600">{joinError}</p>}
          <button
            type="submit"
            disabled={joining || !email.trim() || !name.trim()}
            className="btn-primary w-full disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join Group"}
          </button>
        </form>
      </div>
    </div>
  );
}
