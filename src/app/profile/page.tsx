"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

export default function ProfilePage() {
  const { data: session, update, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSetup = searchParams.get("setup") === "1";

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("Name cannot be empty"); return; }
    if (trimmed.length > 50) { setError("Name is too long (max 50 characters)"); return; }

    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save");
        return;
      }
      // Refresh the session so the new name propagates everywhere
      await update({ name: trimmed });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (isSetup) router.replace("/groups");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || !session) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      {isSetup && (
        <div className="mb-6 rounded-xl bg-blue-50 border border-blue-200 px-4 py-4">
          <p className="text-sm font-semibold text-blue-800">Welcome! Set your display name</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Choose a name that will be shown to other players instead of your email.
          </p>
        </div>
      )}

      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Your Profile</h1>

        {/* Avatar + email */}
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
          {session.user?.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? "You"}
              width={52}
              height={52}
              className="rounded-full border-2 border-gray-200"
            />
          ) : (
            <div className="w-13 w-[52px] h-[52px] rounded-full bg-fifa-blue text-white text-xl font-bold flex items-center justify-center">
              {(session.user?.name ?? session.user?.email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-800">{session.user?.name ?? "—"}</p>
            <p className="text-sm text-gray-400">{session.user?.email}</p>
          </div>
        </div>

        {/* Name form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your display name"
              maxLength={50}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
            <p className="text-xs text-gray-400 mt-1">
              This is shown on leaderboards and to other group members instead of your email.
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : isSetup ? "Save & Continue" : "Save Changes"}
            </button>
            {!isSetup && (
              <button
                type="button"
                onClick={() => router.back()}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Sign out */}
      <div className="mt-6 text-center">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-sm text-red-400 hover:text-red-600"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
