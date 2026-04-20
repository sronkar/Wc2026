"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface InviteDetails {
  groupId: string;
  groupName: string;
  email: string;
  memberRole: string;
  expiresAt: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState("");

  // Form state (for unauthenticated users)
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Accept state (for authenticated users)
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setLoadError(data.error);
        else setInvite(data);
      })
      .catch(() => setLoadError("Failed to load invite"));
  }, [token]);

  // Instant login via invite token (no email required — token proves access)
  const handleInstantJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    setJoinError("");
    const res = await fetch(`/api/invite/${token}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
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

  // Accept for an already-authenticated user
  const handleAccept = async () => {
    setAccepting(true);
    const res = await fetch(`/api/invite/${token}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setJoinError(data.error ?? "Failed to accept invite");
      setAccepting(false);
    } else {
      setAccepted(true);
      setTimeout(() => router.push(`/groups/${data.groupId}`), 1200);
    }
  };

  if (!invite && !loadError) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  }

  if (loadError) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="card">
          <p className="text-4xl mb-4">⚠️</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invite unavailable</h1>
          <p className="text-gray-500 text-sm mb-6">{loadError}</p>
          <Link href="/groups" className="btn-primary">Browse Groups</Link>
        </div>
      </div>
    );
  }

  const roleLabel =
    invite!.memberRole === "VISITOR_ADMIN" ? "Visitor Admin (no predictions)" : "Member";

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card text-center">
        <div className="w-16 h-16 rounded-full bg-fifa-blue text-white font-extrabold text-2xl flex items-center justify-center mx-auto mb-4">
          {invite!.groupName.charAt(0).toUpperCase()}
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">You&apos;re invited!</h1>
        <p className="text-gray-500 text-sm mb-1">
          Join <strong className="text-gray-800">{invite!.groupName}</strong>
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Role: <span className="font-semibold text-gray-600">{roleLabel}</span>
        </p>

        {accepted ? (
          <p className="text-green-600 font-semibold py-4">✓ Joined! Redirecting…</p>
        ) : status === "loading" ? null : !session ? (
          /* ── Unauthenticated: instant join form ── */
          <form onSubmit={handleInstantJoin} className="text-left space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={invite!.email}
                readOnly
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
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
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              />
            </div>
            {joinError && <p className="text-sm text-red-600">{joinError}</p>}
            <button
              type="submit"
              disabled={joining || !name.trim()}
              className="btn-primary w-full disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join Group"}
            </button>
          </form>
        ) : session.user?.email?.toLowerCase() !== invite!.email.toLowerCase() ? (
          /* ── Wrong account signed in ── */
          <>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              This invite was sent to <strong>{invite!.email}</strong>, but you&apos;re signed in as{" "}
              <strong>{session.user?.email}</strong>.
            </p>
            {joinError && <p className="text-sm text-red-600 mb-3">{joinError}</p>}
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="btn-primary w-full disabled:opacity-50"
            >
              {accepting ? "Joining…" : "Join anyway"}
            </button>
          </>
        ) : (
          /* ── Correct account: one-click accept ── */
          <>
            {joinError && <p className="text-sm text-red-600 mb-3">{joinError}</p>}
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="btn-primary w-full disabled:opacity-50"
            >
              {accepting ? "Joining…" : "Accept & Join Group"}
            </button>
          </>
        )}

        <p className="text-xs text-gray-400 mt-5">
          Expires {new Date(invite!.expiresAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
