"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface GroupInfo {
  groupId: string;
  groupName: string;
  description: string | null;
  memberCount: number;
}

type State = "loading" | "form" | "check_email" | "joining" | "joined" | "already" | "invalid" | "error";

export default function JoinByLinkPage() {
  const { data: session, status } = useSession();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [state, setState] = useState<State>("loading");
  const [group, setGroup] = useState<GroupInfo | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load group info (works without auth)
  useEffect(() => {
    fetch(`/api/join/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setState("invalid"); return; }
        setGroup(d);
      })
      .catch(() => setState("invalid"));
  }, [token]);

  // Handle auth state changes
  useEffect(() => {
    if (status === "loading" || !group) return;

    if (!session) {
      // Show form (don't redirect to /login)
      setState("form");
      return;
    }

    // Authenticated — check for pendingName in URL and apply it, then auto-join
    const params = new URLSearchParams(window.location.search);
    const pendingName = params.get("pendingName") ?? "";

    setState("joining");

    const doJoin = async () => {
      // Apply name if this is a new user who just signed up via the form
      if (pendingName && !session.user?.name) {
        await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: pendingName }),
        });
        // Also clear from URL without reloading
        try { window.history.replaceState({}, "", `/join/${token}`); } catch {}
      }

      const res = await fetch(`/api/join/${token}`, { method: "POST" });
      const d = await res.json();
      if (d.error === "invalid") { setState("invalid"); return; }
      if (d.error) { setState("error"); return; }
      setState(d.alreadyMember ? "already" : "joined");
    };

    doJoin().catch(() => setState("error"));
  }, [session, status, group, token]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!email.trim()) { setFormError("Email is required"); return; }
    if (!name.trim()) { setFormError("Your name is required"); return; }
    if (name.trim().length > 50) { setFormError("Name too long (max 50 chars)"); return; }

    setSubmitting(true);
    try {
      const callbackUrl = `/join/${token}?pendingName=${encodeURIComponent(name.trim())}`;
      const res = await signIn("email", { email: email.trim(), callbackUrl, redirect: false });
      if (res?.error) { setFormError("Could not send sign-in link. Check your email."); }
      else { setState("check_email"); }
    } catch {
      setFormError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  if (state === "loading" && !group) {
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
        <p className="text-gray-400 text-sm mb-6">Could not process your request. Please try again.</p>
        <Link href="/groups" className="btn-primary">Browse Groups</Link>
      </div>
    );
  }

  if (state === "check_email") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-5xl mb-4">📧</p>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-gray-400 text-sm">
          We sent a sign-in link to <strong>{email}</strong>. Click it to complete joining{" "}
          <strong>{group?.groupName}</strong>.
        </p>
      </div>
    );
  }

  if (state === "joining") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <span className="inline-block w-6 h-6 border-2 border-gray-300 border-t-fifa-blue rounded-full animate-spin" />
        Joining group…
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
          {state === "already" ? "You're already an approved member." : "You're in! Start predicting now."}
        </p>
        {group?.groupId && (
          <Link href={`/groups/${group.groupId}`} className="btn-primary">Go to Group Dashboard</Link>
        )}
      </div>
    );
  }

  // "form" state — show group info + sign-up form
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-fifa-blue text-white font-extrabold text-2xl flex items-center justify-center mx-auto mb-3">
            {group?.groupName.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Join {group?.groupName}</h1>
          {group?.description && <p className="text-xs text-gray-400">{group.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{group?.memberCount} {group?.memberCount === 1 ? "member" : "members"}</p>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How you'll appear in the group"
              maxLength={50}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
            {submitting ? "Sending sign-in link…" : "Continue with Email"}
          </button>
          <p className="text-xs text-gray-400 text-center">
            We&apos;ll email you a sign-in link — no password needed.
          </p>
        </form>
      </div>
    </div>
  );
}
