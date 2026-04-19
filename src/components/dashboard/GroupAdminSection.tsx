"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Membership {
  userId: string;
  status: string;
  memberRole: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null; image: string | null };
}

interface PendingInvite {
  id: string;
  email: string;
  memberRole: string;
  createdAt: string;
  expiresAt: string;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  createdAt: string;
}

interface CustomPredictionAdmin {
  id: string;
  question: string;
  options: string[];
  points: number;
  lockTime: string;
  correctOption: string | null;
  status: string;
  answerCount: number;
  answers: { userName: string; option: string; points: number | null }[];
}

interface GroupSettings {
  exactMatchPoints: number;
  directionMatchPoints: number;
}

interface Match {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  round: string;
  city: string;
  kickoff: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

interface PredictionRow {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  homeScore: number;
  awayScore: number;
  points: number | null;
}

const ROUNDS = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
];

export function GroupAdminSection({ groupId }: { groupId: string }) {
  // ── Members state ─────────────────────────────────────────────────────────────
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [memberUpdating, setMemberUpdating] = useState<Record<string, boolean>>({});

  // ── Add member state ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("MEMBER");
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [addMemberMessage, setAddMemberMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Invite state ──────────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  // ── Settings state ────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<GroupSettings>({ exactMatchPoints: 5, directionMatchPoints: 1 });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ── Custom predictions state ──────────────────────────────────────────────────
  const [customPredictions, setCustomPredictions] = useState<CustomPredictionAdmin[]>([]);
  const [customLoaded, setCustomLoaded] = useState(false);
  const [cpForm, setCpForm] = useState({ question: "", options: ["", ""], points: 3, lockTime: "" });
  const [cpCreating, setCpCreating] = useState(false);
  const [cpResolving, setCpResolving] = useState<Record<string, string>>({});
  const [cpResolvingSaving, setCpResolvingSaving] = useState<Record<string, boolean>>({});
  const [cpDeleting, setCpDeleting] = useState<Record<string, boolean>>({});

  // ── Edit predictions state ────────────────────────────────────────────────────
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [epMatchId, setEpMatchId] = useState("");
  const [epPredictions, setEpPredictions] = useState<PredictionRow[]>([]);
  const [epInputs, setEpInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [epLoading, setEpLoading] = useState(false);
  const [epSaving, setEpSaving] = useState<Record<string, boolean>>({});
  const [epSaved, setEpSaved] = useState<Set<string>>(new Set());

  // ── Load data on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    // Load memberships
    fetch(`/api/admin/groups/${groupId}/members`)
      .then((r) => r.json())
      .then((data: Membership[]) => {
        setMemberships(data);
        setMembersLoaded(true);
      });

    // Load group settings
    fetch(`/api/groups/${groupId}`)
      .then((r) => r.json())
      .then((data: { exactMatchPoints?: number; directionMatchPoints?: number }) => {
        if (data.exactMatchPoints !== undefined && data.directionMatchPoints !== undefined) {
          setSettings({
            exactMatchPoints: data.exactMatchPoints,
            directionMatchPoints: data.directionMatchPoints,
          });
        }
        setSettingsLoaded(true);
      });

    // Load all users for add-member dropdown
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: UserRow[]) => {
        setUsers(data);
        setUsersLoaded(true);
      });

    // Load custom predictions
    fetch(`/api/admin/custom-predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data: CustomPredictionAdmin[]) => {
        setCustomPredictions(data);
        setCustomLoaded(true);
      });

    // Load matches for edit-predictions selector
    fetch("/api/matches")
      .then((r) => r.json())
      .then((data: Match[]) => {
        setMatches(data);
        setMatchesLoaded(true);
      });

    // Load pending invites
    fetch(`/api/groups/${groupId}/invite`)
      .then((r) => r.json())
      .then((data: PendingInvite[]) => { if (Array.isArray(data)) setPendingInvites(data); });
  }, [groupId]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const pending = memberships.filter((m) => m.status === "PENDING");
  const approved = memberships.filter((m) => m.status === "APPROVED");
  const rejected = memberships.filter((m) => m.status === "REJECTED");

  // ── Member handlers ───────────────────────────────────────────────────────────
  const handleMemberStatus = async (userId: string, status: "APPROVED" | "REJECTED") => {
    setMemberUpdating((p) => ({ ...p, [userId]: true }));
    const res = await fetch(`/api/admin/groups/${groupId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setMemberships((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, status } : m))
      );
    }
    setMemberUpdating((p) => ({ ...p, [userId]: false }));
  };

  const handleRemoveMember = async (userId: string) => {
    setMemberUpdating((p) => ({ ...p, [userId]: true }));
    const res = await fetch(`/api/admin/groups/${groupId}/members/${userId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMemberships((prev) => prev.filter((m) => m.userId !== userId));
    }
    setMemberUpdating((p) => ({ ...p, [userId]: false }));
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    const res = await fetch(`/api/groups/${groupId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), memberRole: inviteRole }),
    });
    if (res.ok) {
      setPendingInvites((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          email: inviteEmail.trim().toLowerCase(),
          memberRole: inviteRole,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);
      setInviteEmail("");
      setInviteMessage({ ok: true, text: `Invite sent to ${inviteEmail.trim()}` });
    } else {
      const err = await res.json().catch(() => ({}));
      setInviteMessage({ ok: false, text: (err as { error?: string }).error ?? "Failed to send invite" });
    }
    setInviteSending(false);
    setTimeout(() => setInviteMessage(null), 4000);
  };

  const handleAddMember = async () => {
    const userId = addMemberInput.trim();
    if (!userId) return;
    setAddMemberSaving(true);
    const res = await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, memberRole: addMemberRole }),
    });
    if (res.ok) {
      const result = await res.json();
      // POST returns the full membership with user
      const addedUser = result.user ?? users.find((u) => u.id === userId);
      setMemberships((prev) => {
        const existing = prev.find((m) => m.userId === userId);
        if (existing) {
          return prev.map((m) => (m.userId === userId ? { ...m, status: "APPROVED" } : m));
        }
        return [
          ...prev,
          {
            userId,
            status: "APPROVED",
            createdAt: new Date().toISOString(),
            user: {
              id: userId,
              name: addedUser?.name ?? null,
              email: addedUser?.email ?? null,
              image: addedUser?.image ?? null,
            },
          },
        ];
      });
      setAddMemberInput("");
      setAddMemberMessage({
        ok: true,
        text: `${addedUser?.name ?? addedUser?.email ?? "User"} added!`,
      });
    } else {
      const err = await res.json().catch(() => ({}));
      setAddMemberMessage({ ok: false, text: (err as { error?: string }).error ?? "Failed to add member" });
    }
    setAddMemberSaving(false);
    setTimeout(() => setAddMemberMessage(null), 3000);
  };

  // ── Settings handler ──────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    await fetch(`/api/admin/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exactMatchPoints: settings.exactMatchPoints,
        directionMatchPoints: settings.directionMatchPoints,
      }),
    });
    setSettingsSaving(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // ── Custom prediction handlers ────────────────────────────────────────────────
  const handleCreateCustomPrediction = async () => {
    const cleanOptions = cpForm.options.map((o) => o.trim()).filter(Boolean);
    if (!cpForm.question.trim() || cleanOptions.length < 2 || !cpForm.lockTime) return;
    setCpCreating(true);
    const res = await fetch("/api/admin/custom-predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: cpForm.question.trim(),
        options: cleanOptions,
        points: cpForm.points,
        lockTime: new Date(cpForm.lockTime).toISOString(),
        groupId,
      }),
    });
    if (res.ok) {
      setCpForm({ question: "", options: ["", ""], points: 3, lockTime: "" });
      // Reload predictions list
      const updated = await fetch(`/api/admin/custom-predictions?groupId=${groupId}`).then((r) => r.json());
      setCustomPredictions(updated);
    }
    setCpCreating(false);
  };

  const handleResolvePrediction = async (cpId: string) => {
    const correctOption = cpResolving[cpId];
    if (!correctOption) return;
    setCpResolvingSaving((p) => ({ ...p, [cpId]: true }));
    const res = await fetch(`/api/admin/custom-predictions/${cpId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", correctOption }),
    });
    if (res.ok) {
      setCustomPredictions((prev) =>
        prev.map((cp) => (cp.id === cpId ? { ...cp, status: "RESOLVED", correctOption } : cp))
      );
    }
    setCpResolvingSaving((p) => ({ ...p, [cpId]: false }));
  };

  const handleDeleteCustomPrediction = async (cpId: string) => {
    if (!confirm("Delete this prediction and all its answers?")) return;
    setCpDeleting((p) => ({ ...p, [cpId]: true }));
    const res = await fetch(`/api/admin/custom-predictions/${cpId}`, { method: "DELETE" });
    if (res.ok) {
      setCustomPredictions((prev) => prev.filter((cp) => cp.id !== cpId));
    }
    setCpDeleting((p) => ({ ...p, [cpId]: false }));
  };

  // ── Edit predictions: load when match selected ───────────────────────────────
  useEffect(() => {
    if (!epMatchId) {
      setEpPredictions([]);
      setEpInputs({});
      return;
    }
    setEpLoading(true);
    fetch(`/api/admin/matches/${epMatchId}/predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data: PredictionRow[]) => {
        setEpPredictions(data);
        const inputs: Record<string, { home: string; away: string }> = {};
        data.forEach((p) => {
          inputs[p.userId] = { home: String(p.homeScore), away: String(p.awayScore) };
        });
        setEpInputs(inputs);
      })
      .finally(() => setEpLoading(false));
  }, [epMatchId, groupId]);

  const handleSavePrediction = async (userId: string) => {
    const input = epInputs[userId];
    if (!input || !epMatchId) return;
    const home = parseInt(input.home, 10);
    const away = parseInt(input.away, 10);
    if (isNaN(home) || isNaN(away)) return;
    setEpSaving((p) => ({ ...p, [userId]: true }));
    await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, matchId: epMatchId, groupId, homeScore: home, awayScore: away }),
    });
    setEpSaving((p) => ({ ...p, [userId]: false }));
    setEpSaved((p) => new Set(Array.from(p).concat(userId)));
    setTimeout(
      () => setEpSaved((p) => { const s = new Set(Array.from(p)); s.delete(userId); return s; }),
      2000
    );
    setEpPredictions((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, homeScore: home, awayScore: away } : p))
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── A. Pending Join Requests ─────────────────────────────────────────── */}
      {!membersLoaded ? null : pending.length > 0 ? (
        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold shrink-0">
              {pending.length}
            </span>
            <h3 className="font-bold text-orange-800 text-sm uppercase tracking-wide">
              Pending Join Requests
            </h3>
          </div>
          <div className="space-y-2">
            {pending.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-orange-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {m.user.image ? (
                    <Image
                      src={m.user.image}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-orange-200 flex items-center justify-center text-xs text-orange-700 font-bold shrink-0">
                      {(m.user.name ?? m.user.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {m.user.name ?? "—"}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleMemberStatus(m.userId, "APPROVED")}
                    disabled={memberUpdating[m.userId]}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-40"
                  >
                    {memberUpdating[m.userId] ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleMemberStatus(m.userId, "REJECTED")}
                    disabled={memberUpdating[m.userId]}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 disabled:opacity-40"
                  >
                    {memberUpdating[m.userId] ? "…" : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Members + Add Member ─────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-4">Members</h3>

        {/* Invite by email */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Invite by Email
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 min-w-40 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            >
              <option value="MEMBER">Member</option>
              <option value="VISITOR_ADMIN">Visitor Admin</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={inviteSending || !inviteEmail.trim()}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 disabled:opacity-40 shrink-0"
            >
              {inviteSending ? "Sending…" : "Send Invite"}
            </button>
          </div>
          {inviteMessage && (
            <p className={`text-xs mt-1 ${inviteMessage.ok ? "text-green-600" : "text-red-500"}`}>
              {inviteMessage.text}
            </p>
          )}
          {pendingInvites.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-400 font-medium">Pending invites:</p>
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span>{inv.email}</span>
                  <span className="text-gray-300">·</span>
                  <span>{inv.memberRole === "VISITOR_ADMIN" ? "Visitor Admin" : "Member"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add existing user directly */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Add Existing User Directly
          </p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={addMemberInput}
              onChange={(e) => setAddMemberInput(e.target.value)}
              className="flex-1 min-w-32 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            >
              <option value="">— select user —</option>
              {usersLoaded &&
                users
                  .filter((u) => !memberships.some((m) => m.userId === u.id && m.status === "APPROVED"))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email}
                    </option>
                  ))}
            </select>
            <select
              value={addMemberRole}
              onChange={(e) => setAddMemberRole(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            >
              <option value="MEMBER">Member</option>
              <option value="VISITOR_ADMIN">Visitor Admin</option>
            </select>
            <button
              onClick={handleAddMember}
              disabled={addMemberSaving || !addMemberInput}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-40 shrink-0"
            >
              {addMemberSaving ? "…" : "Add"}
            </button>
          </div>
          {addMemberMessage && (
            <p className={`text-xs mt-1 ${addMemberMessage.ok ? "text-green-600" : "text-red-500"}`}>
              {addMemberMessage.text}
            </p>
          )}
        </div>

        {/* Approved members list */}
        {!membersLoaded ? (
          <div className="text-sm text-gray-400 py-4 text-center">Loading members…</div>
        ) : approved.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">No approved members yet.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
              Approved ({approved.length})
            </p>
            {approved.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {m.user.image ? (
                    <Image
                      src={m.user.image}
                      alt=""
                      width={24}
                      height={24}
                      className="rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 shrink-0">
                      {(m.user.name ?? m.user.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {m.user.name ?? "—"}
                      </p>
                      {m.memberRole === "VISITOR_ADMIN" && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          Visitor
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveMember(m.userId)}
                  disabled={memberUpdating[m.userId]}
                  className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 shrink-0"
                >
                  {memberUpdating[m.userId] ? "…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Rejected members */}
        {rejected.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Rejected ({rejected.length})
            </p>
            {rejected.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 opacity-60"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {m.user.image ? (
                    <Image
                      src={m.user.image}
                      alt=""
                      width={24}
                      height={24}
                      className="rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 shrink-0">
                      {(m.user.name ?? m.user.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm text-gray-600 truncate">
                    {m.user.name ?? m.user.email ?? "—"}
                  </p>
                </div>
                <button
                  onClick={() => handleMemberStatus(m.userId, "APPROVED")}
                  disabled={memberUpdating[m.userId]}
                  className="text-xs text-fifa-blue hover:underline disabled:opacity-40 shrink-0"
                >
                  {memberUpdating[m.userId] ? "…" : "Re-approve"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── B. Group Settings ────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-1">Group Settings</h3>
        <p className="text-xs text-gray-400 mb-4">
          Points awarded to members of this group for correct predictions.
        </p>
        {!settingsLoaded ? (
          <div className="text-sm text-gray-400 py-2">Loading…</div>
        ) : (
          <div className="flex flex-wrap gap-6 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Exact Score (pts)</label>
              <input
                type="number"
                min="0"
                value={settings.exactMatchPoints}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, exactMatchPoints: Number(e.target.value) }))
                }
                className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Correct Winner/Draw (pts)
              </label>
              <input
                type="number"
                min="0"
                value={settings.directionMatchPoints}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    directionMatchPoints: Number(e.target.value),
                  }))
                }
                className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              />
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              className="btn-primary disabled:opacity-50"
            >
              {settingsSaving ? "Saving…" : settingsSaved ? "Saved ✓" : "Save Settings"}
            </button>
          </div>
        )}
      </div>

      {/* ── C. Edit Predictions ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-800">Edit Member Predictions</h3>
        <div className="card">
          <label className="block text-xs text-gray-500 mb-1">Select Match</label>
          <select
            value={epMatchId}
            onChange={(e) => setEpMatchId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            disabled={!matchesLoaded}
          >
            <option value="">— choose a match —</option>
            {ROUNDS.map((round) => {
              const roundMatches = matches.filter((m) => m.round === round);
              if (roundMatches.length === 0) return null;
              return (
                <optgroup key={round} label={round}>
                  {roundMatches.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.matchNumber} {m.homeTeam} vs {m.awayTeam}
                      {m.status === "FINISHED" ? ` (${m.homeScore}–${m.awayScore})` : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {epMatchId && (() => {
          const selectedMatch = matches.find((m) => m.id === epMatchId);
          const isLocked = selectedMatch
            ? Date.now() >= new Date(selectedMatch.kickoff).getTime() - 60 * 60 * 1000
            : false;
          return (
            <>
              {isLocked && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
                  🔒 <strong>Predictions locked.</strong> This match is within 1 hour of kickoff or has finished.
                </div>
              )}
              <div className="card overflow-hidden p-0">
                {epLoading ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Loading predictions…</div>
                ) : epPredictions.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">No predictions for this match yet.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Prediction</th>
                        <th className="px-4 py-3">Points</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {epPredictions.map((pred, i) => {
                        const input = epInputs[pred.userId] ?? { home: String(pred.homeScore), away: String(pred.awayScore) };
                        return (
                          <tr key={pred.userId} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {pred.userImage ? (
                                  <Image src={pred.userImage} alt="" width={28} height={28} className="rounded-full" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                                    {pred.userName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span className="font-medium text-gray-800">{pred.userName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {isLocked ? (
                                <span className="font-semibold text-gray-700">{pred.homeScore} – {pred.awayScore}</span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min="0" max="20" value={input.home}
                                    onChange={(e) =>
                                      setEpInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], home: e.target.value } }))
                                    }
                                    className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                                  />
                                  <span className="text-gray-400">–</span>
                                  <input
                                    type="number" min="0" max="20" value={input.away}
                                    onChange={(e) =>
                                      setEpInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], away: e.target.value } }))
                                    }
                                    className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                                  />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {pred.points !== null ? (
                                <span className="font-semibold text-fifa-blue">{pred.points} pts</span>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {isLocked ? (
                                <span className="text-xs text-gray-400">🔒</span>
                              ) : (
                                <button
                                  onClick={() => handleSavePrediction(pred.userId)}
                                  disabled={epSaving[pred.userId]}
                                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                                >
                                  {epSaving[pred.userId] ? "…" : epSaved.has(pred.userId) ? "Saved ✓" : "✎ Edit"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* ── D. Custom Predictions ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-800">Custom Predictions</h3>

        {/* Create form */}
        <div className="card">
          <h4 className="font-semibold text-gray-700 mb-4 text-sm">Create Custom Prediction</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Question</label>
              <input
                type="text"
                value={cpForm.question}
                onChange={(e) => setCpForm((f) => ({ ...f, question: e.target.value }))}
                placeholder="e.g. Who will be top scorer?"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Options (min 2)</label>
              <div className="space-y-2">
                {cpForm.options.map((opt, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) =>
                        setCpForm((f) => {
                          const opts = [...f.options];
                          opts[idx] = e.target.value;
                          return { ...f, options: opts };
                        })
                      }
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                    />
                    {cpForm.options.length > 2 && (
                      <button
                        onClick={() =>
                          setCpForm((f) => ({
                            ...f,
                            options: f.options.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-red-400 hover:text-red-600 text-sm px-2"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() =>
                    setCpForm((f) => ({ ...f, options: [...f.options, ""] }))
                  }
                  className="text-xs text-fifa-blue hover:underline"
                >
                  + Add option
                </button>
              </div>
            </div>
            <div className="flex gap-4 flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Points</label>
                <input
                  type="number"
                  min="1"
                  value={cpForm.points}
                  onChange={(e) =>
                    setCpForm((f) => ({ ...f, points: Number(e.target.value) }))
                  }
                  className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div className="flex-1 min-w-48">
                <label className="block text-xs text-gray-500 mb-1">Lock Time</label>
                <input
                  type="datetime-local"
                  value={cpForm.lockTime}
                  onChange={(e) => setCpForm((f) => ({ ...f, lockTime: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
            </div>
            <button
              onClick={handleCreateCustomPrediction}
              disabled={cpCreating}
              className="btn-primary disabled:opacity-50"
            >
              {cpCreating ? "Creating…" : "Create Prediction"}
            </button>
          </div>
        </div>

        {/* Predictions list */}
        {!customLoaded ? (
          <div className="card text-center text-gray-400 text-sm py-8">Loading…</div>
        ) : customPredictions.length === 0 ? (
          <div className="card text-center text-gray-400 text-sm py-8">
            No custom predictions for this group yet.
          </div>
        ) : (
          <div className="space-y-4">
            {customPredictions.map((cp) => {
              const isLocked = new Date(cp.lockTime).getTime() <= Date.now();
              return (
                <div key={cp.id} className="card">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{cp.question}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {cp.points} pts · Lock: {new Date(cp.lockTime).toLocaleString()} ·{" "}
                        {cp.answerCount} {cp.answerCount === 1 ? "answer" : "answers"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`badge ${
                          cp.status === "RESOLVED"
                            ? "bg-green-100 text-green-700"
                            : isLocked
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {cp.status === "RESOLVED" ? "Resolved" : isLocked ? "Locked" : "Open"}
                      </span>
                      <button
                        onClick={() => handleDeleteCustomPrediction(cp.id)}
                        disabled={cpDeleting[cp.id]}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                      >
                        {cpDeleting[cp.id] ? "…" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {/* Options summary */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {cp.options.map((opt) => {
                      const count = cp.answers.filter((a) => a.option === opt).length;
                      return (
                        <span
                          key={opt}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            cp.correctOption === opt
                              ? "bg-green-50 border-green-300 text-green-700 font-semibold"
                              : "bg-gray-50 border-gray-200 text-gray-600"
                          }`}
                        >
                          {cp.correctOption === opt && "✓ "}
                          {opt} ({count})
                        </span>
                      );
                    })}
                  </div>

                  {/* Resolve form */}
                  {cp.status === "OPEN" && isLocked && (
                    <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-3">
                      <label className="text-xs text-gray-500">Correct answer:</label>
                      <select
                        value={cpResolving[cp.id] ?? ""}
                        onChange={(e) =>
                          setCpResolving((p) => ({ ...p, [cp.id]: e.target.value }))
                        }
                        className="flex-1 min-w-32 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                      >
                        <option value="">— select —</option>
                        {cp.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleResolvePrediction(cp.id)}
                        disabled={!cpResolving[cp.id] || cpResolvingSaving[cp.id]}
                        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
                      >
                        {cpResolvingSaving[cp.id] ? "Saving…" : "Resolve & Award Points"}
                      </button>
                    </div>
                  )}

                  {cp.status === "RESOLVED" && cp.correctOption && (
                    <p className="text-xs text-green-600 border-t border-gray-100 pt-2">
                      ✓ Resolved · Correct answer: <strong>{cp.correctOption}</strong>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
