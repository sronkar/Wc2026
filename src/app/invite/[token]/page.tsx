"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface InviteDetails {
  groupId: string;
  groupName: string;
  requirePassword: boolean;
  userHasPassword: boolean;
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

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

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

  const handleInstantJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (invite?.requirePassword && !password.trim()) return;
    setJoining(true);
    setJoinError("");
    const res = await fetch(`/api/invite/${token}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        ...(password.trim() ? { password: password.trim() } : {}),
      }),
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

  const handleAccept = async () => {
    const needsPassword = invite?.requirePassword && !invite.userHasPassword;
    if (needsPassword && (!password.trim() || password.trim().length < 12)) {
      setJoinError("Please set a password (min. 12 characters) to join this group.");
      return;
    }
    setAccepting(true);
    setJoinError("");
    const res = await fetch(`/api/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(needsPassword ? { password: password.trim() } : {}),
    });
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-gray-900">WC2026 Predictions</h1>
          <p className="text-gray-500 mt-1 text-sm">You&apos;re invited to join a group</p>
        </div>

        <div className="card">
          {/* Group info */}
          <div className="text-center pb-5 mb-5 border-b border-gray-100">
            <div className="w-14 h-14 rounded-full bg-fifa-blue text-white font-extrabold text-xl flex items-center justify-center mx-auto mb-3">
              {invite!.groupName.charAt(0).toUpperCase()}
            </div>
            <p className="text-lg font-bold text-gray-900">{invite!.groupName}</p>
            <p className="text-xs text-gray-400 mt-1">
              Role: <span className="font-semibold text-gray-600">{roleLabel}</span>
            </p>
          </div>

          {accepted ? (
            <p className="text-green-600 font-semibold text-center py-4">✓ Joined! Redirecting…</p>
          ) : status === "loading" ? null : !session ? (
            /* Unauthenticated: join form */
            <form onSubmit={handleInstantJoin} className="space-y-4">
              {/* Email — pre-populated, read-only */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={invite!.email}
                  readOnly
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Your name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your display name"
                  required
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>

              {/* Password — required or optional based on group setting */}
              {invite!.requirePassword ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password (min. 12 characters)"
                      required
                      minLength={12}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    You can sign in with email + password after joining.
                  </p>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                  >
                    {showPassword ? "Cancel — skip password" : "Set a password (optional)"}
                  </button>
                  {showPassword && (
                    <div className="mt-2">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a password (min. 12 characters)"
                        minLength={12}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Optional — lets you sign in with email &amp; password later.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {joinError && <p className="text-sm text-red-600">{joinError}</p>}

              <button
                type="submit"
                disabled={joining || !name.trim() || (invite!.requirePassword && !password.trim())}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {joining ? "Joining…" : "Join Group"}
              </button>
            </form>
          ) : session.user?.email?.toLowerCase() !== invite!.email.toLowerCase() ? (
            /* Wrong account signed in */
            <>
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                This invite was sent to <strong>{invite!.email}</strong>, but you&apos;re signed in as{" "}
                <strong>{session.user?.email}</strong>.
              </p>
              {joinError && <p className="text-sm text-red-600 mb-3">{joinError}</p>}
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {accepting ? "Joining…" : "Join anyway"}
              </button>
            </>
          ) : (
            /* Correct account: accept (with password if required and not yet set) */
            <>
              {invite!.requirePassword && !invite!.userHasPassword && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password (min. 12 characters)"
                      minLength={12}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Required by this group — lets you sign in with email &amp; password later.
                  </p>
                </div>
              )}
              {joinError && <p className="text-sm text-red-600 mb-3">{joinError}</p>}
              <button
                onClick={handleAccept}
                disabled={accepting || (invite!.requirePassword && !invite!.userHasPassword && password.trim().length < 12)}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {accepting ? "Joining…" : "Accept & Join Group"}
              </button>
            </>
          )}

          <p className="text-xs text-gray-400 mt-5 text-center">
            Expires {new Date(invite!.expiresAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
