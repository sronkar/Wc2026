"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { PushSubscribeButton } from "@/components/PushSubscribeButton";

function ProfilePageInner() {
  const { data: session, update, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSetup = searchParams.get("setup") === "1";

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [emailReminders, setEmailReminders] = useState(true);
  const [emailLock30m, setEmailLock30m] = useState(true);
  const [emailPostGame, setEmailPostGame] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [pushReminders, setPushReminders] = useState(true);
  const [pushLock30m, setPushLock30m] = useState(true);
  const [pushPostGame, setPushPostGame] = useState(true);
  const [savingPush, setSavingPush] = useState(false);
  const [allowDirectAdd, setAllowDirectAdd] = useState(true);
  const [savingDirectAdd, setSavingDirectAdd] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.emailNotifications === "boolean") setEmailNotifications(d.emailNotifications);
        if (typeof d.emailReminders === "boolean") setEmailReminders(d.emailReminders);
        if (typeof d.emailLock30m === "boolean") setEmailLock30m(d.emailLock30m);
        if (typeof d.emailPostGame === "boolean") setEmailPostGame(d.emailPostGame);
        if (typeof d.pushNotifications === "boolean") setPushNotifications(d.pushNotifications);
        if (typeof d.pushReminders === "boolean") setPushReminders(d.pushReminders);
        if (typeof d.pushLock30m === "boolean") setPushLock30m(d.pushLock30m);
        if (typeof d.pushPostGame === "boolean") setPushPostGame(d.pushPostGame);
        if (typeof d.allowDirectAdd === "boolean") setAllowDirectAdd(d.allowDirectAdd);
      })
      .catch(() => {});
  }, [session?.user?.id]);

  const togglePref = async (
    field: string, val: boolean,
    setter: (v: boolean) => void,
    setSaving: (v: boolean) => void,
  ) => {
    setter(val);
    setSaving(true);
    try {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: val }),
      });
    } catch {}
    setSaving(false);
  };

  const toggleAllowDirectAdd = async (val: boolean) => {
    setAllowDirectAdd(val);
    setSavingDirectAdd(true);
    try {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowDirectAdd: val }),
      });
    } catch {}
    setSavingDirectAdd(false);
  };

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
            <div className="w-[52px] h-[52px] rounded-full bg-fifa-blue text-white text-xl font-bold flex items-center justify-center">
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

      {/* Notification settings */}
      <div className="card mt-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Notification Settings</h2>
        <div className="space-y-4">
          {/* Master toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Email notifications</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Receive match reminders and result updates by email.
              </p>
            </div>
            <button
              onClick={() => togglePref("emailNotifications", !emailNotifications, setEmailNotifications, setSavingEmail)}
              disabled={savingEmail}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                emailNotifications ? "bg-fifa-blue" : "bg-gray-200"
              }`}
              aria-checked={emailNotifications}
              role="switch"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  emailNotifications ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Sub-toggles — only visible when master is on */}
          {emailNotifications && (
            <div className="ml-4 pl-3 border-l-2 border-gray-100 space-y-3">
              {(
                [
                  { field: "emailReminders", label: "Match reminders", desc: "1 hour before predictions lock.", val: emailReminders, set: setEmailReminders },
                  { field: "emailLock30m", label: "30-minute warnings", desc: "Last call — 30 min before lock.", val: emailLock30m, set: setEmailLock30m },
                  { field: "emailPostGame", label: "Post-game results", desc: "Your points after each match.", val: emailPostGame, set: setEmailPostGame },
                ] as const
              ).map(({ field, label, desc, val, set }) => (
                <div key={field} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <button
                    onClick={() => togglePref(field, !val, set as (v: boolean) => void, setSavingEmail)}
                    disabled={savingEmail}
                    className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                      val ? "bg-fifa-blue" : "bg-gray-200"
                    }`}
                    aria-checked={val}
                    role="switch"
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        val ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Push notification settings */}
      <div className="card mt-4">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Push Notifications</h2>
        <p className="text-xs text-gray-400 mb-4">
          Get notified on your device — works when the app is added to your home screen.
        </p>
        <div className="space-y-4">
          {/* Device subscription row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">This device</p>
              <p className="text-xs text-gray-400 mt-0.5">Allow this device to receive push alerts.</p>
            </div>
            <PushSubscribeButton />
          </div>

          {/* Master preference toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Push notifications</p>
              <p className="text-xs text-gray-400 mt-0.5">Send push alerts to subscribed devices.</p>
            </div>
            <button
              onClick={() => togglePref("pushNotifications", !pushNotifications, setPushNotifications, setSavingPush)}
              disabled={savingPush}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                pushNotifications ? "bg-fifa-blue" : "bg-gray-200"
              }`}
              aria-checked={pushNotifications}
              role="switch"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  pushNotifications ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Sub-toggles */}
          {pushNotifications && (
            <div className="ml-4 pl-3 border-l-2 border-gray-100 space-y-3">
              {(
                [
                  { field: "pushReminders", label: "Match reminders", desc: "1 hour before predictions lock.", val: pushReminders, set: setPushReminders },
                  { field: "pushLock30m", label: "30-minute warnings", desc: "Last call — 30 min before lock.", val: pushLock30m, set: setPushLock30m },
                  { field: "pushPostGame", label: "Post-game results", desc: "Your points after each match.", val: pushPostGame, set: setPushPostGame },
                ] as const
              ).map(({ field, label, desc, val, set }) => (
                <div key={field} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                  <button
                    onClick={() => togglePref(field, !val, set as (v: boolean) => void, setSavingPush)}
                    disabled={savingPush}
                    className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                      val ? "bg-fifa-blue" : "bg-gray-200"
                    }`}
                    aria-checked={val}
                    role="switch"
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        val ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Privacy / group settings */}
      <div className="card mt-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Group Privacy</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Allow admins to add me to groups</p>
            <p className="text-xs text-gray-400 mt-0.5">
              When off, group admins can&apos;t add you directly — they have to send you an invite link you choose to accept.
            </p>
          </div>
          <button
            onClick={() => toggleAllowDirectAdd(!allowDirectAdd)}
            disabled={savingDirectAdd}
            className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              allowDirectAdd ? "bg-fifa-blue" : "bg-gray-200"
            }`}
            aria-checked={allowDirectAdd}
            role="switch"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                allowDirectAdd ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Sign out */}
      <div className="mt-4">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full py-2.5 rounded-lg border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50 hover:border-red-400 hover:text-red-600 transition"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfilePageInner />
    </Suspense>
  );
}
