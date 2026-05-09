"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { GROUP_EMOJI_OPTIONS, isEmojiAvatar } from "@/lib/groupAvatar";
import { WC_GROUPS } from "@/lib/wcGroups";
import { getFlag } from "@/lib/flags";
import { STAGES, type StagePointsMap, defaultStagePoints, DEFAULT_ADVANCEMENT_POINTS, loadStagePoints, isLegacyUniformFill } from "@/lib/stagePoints";

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
  optionType: string;
  options: string[];
  points: number;
  lockTime: string;
  correctOption: string | null;
  status: string;
  answerCount: number;
  answers: { userName: string; option: string; points: number | null }[];
}

function formatExpiry(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `Expires in ${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `Expires in ${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
}


interface GroupSettings {
  stagePoints: StagePointsMap;
  advancementPoints: { exact: number; direction: number };
  isPublic: boolean;
  requirePassword: boolean;
  avatar: string | null;
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
  homeScore: number | null;
  awayScore: number | null;
  points: number | null;
  hidden?: boolean; // server hides scores until lock to prevent admin peeking
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
  const { data: session } = useSession();
  const adminUserId = session?.user?.id;
  // ── Members state ─────────────────────────────────────────────────────────────
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [memberUpdating, setMemberUpdating] = useState<Record<string, boolean>>({});

  // ── Add member state ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("MEMBER");
  const [addMemberNotify, setAddMemberNotify] = useState(true);
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [addMemberMessage, setAddMemberMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Demo bot state ────────────────────────────────────────────────────────────
  const [botLoading, setBotLoading] = useState<Record<string, boolean>>({});
  const [botMessage, setBotMessage] = useState<Record<string, string>>({});

  const handleBotAction = async (bot: "monkey" | "claudio", action: "POST" | "DELETE") => {
    const key = `${bot}-${action}`;
    setBotLoading((p) => ({ ...p, [key]: true }));
    setBotMessage((p) => ({ ...p, [key]: "" }));
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/${bot}`, { method: action });
      const label = bot === "monkey" ? "Monkey" : "Claudio";
      setBotMessage((p) => ({
        ...p,
        [key]: res.ok
          ? action === "DELETE" ? `${label} removed` : `${label} synced ✓`
          : `Failed`,
      }));
    } catch {
      setBotMessage((p) => ({ ...p, [key]: "Failed" }));
    } finally {
      setBotLoading((p) => ({ ...p, [key]: false }));
    }
  };

  // ── Invite state ──────────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  // ── Open join link state ───────────────────────────────────────────────────────
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [joinLinkLoading, setJoinLinkLoading] = useState(false);

  // ── Settings state ────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<GroupSettings>({ stagePoints: defaultStagePoints(), advancementPoints: DEFAULT_ADVANCEMENT_POINTS, isPublic: true, requirePassword: false, avatar: null });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ── Prediction stats state ────────────────────────────────────────────────────
  const [predStats, setPredStats] = useState<{
    stats: { userId: string; userName: string; userImage: string | null; memberRole: string; matchGroupStage: number; matchKnockout: number; customPredictions: number; advancementPicks: number }[];
    totals: { matchGroupStage: number; matchKnockout: number; customPredictions: number; advancementPicks: number };
  } | null>(null);
  const [predStatsLoading, setPredStatsLoading] = useState(false);
  const [predStatsLoaded, setPredStatsLoaded] = useState(false);

  // ── Custom predictions state ──────────────────────────────────────────────────
  const [customPredictions, setCustomPredictions] = useState<CustomPredictionAdmin[]>([]);
  const [customLoaded, setCustomLoaded] = useState(false);
  const [cpForm, setCpForm] = useState({ question: "", optionType: "FIXED", options: ["", ""], points: 3, lockTime: "" });
  const [cpCreating, setCpCreating] = useState(false);

  // ── Batch import state ────────────────────────────────────────────────────────
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importShowHelp, setImportShowHelp] = useState(false);
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
  const [epRevealed, setEpRevealed] = useState<Record<string, boolean>>({});

  // ── Load data on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    // Load memberships
    fetch(`/api/admin/groups/${groupId}/members`)
      .then((r) => r.json())
      .then((data: Membership[]) => {
        setMemberships(data);
        setMembersLoaded(true);
      });

    // Load group settings + global defaults in parallel so the per-stage matrix
    // overlays the group's explicit values on top of the global Point Defaults.
    Promise.all([
      fetch(`/api/groups/${groupId}`).then((r) => r.json()),
      fetch("/api/admin/settings").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([data, globalSettings]: [
      { stagePoints?: string; exactMatchPoints?: number; directionMatchPoints?: number; isPublic?: boolean; requirePassword?: boolean; avatar?: string | null },
      { stagePoints?: string } | null,
    ]) => {
      // Build the per-stage baseline from the global Point Defaults (or the
      // suggested static set if global hasn't been set).
      const globalBase = loadStagePoints(globalSettings?.stagePoints);

      // If the group's stagePoints is empty OR a legacy uniform fill, treat it
      // as "not customised" — show the global baseline. Otherwise overlay the
      // group's explicit values on top.
      const isLegacy = isLegacyUniformFill(
        data.stagePoints,
        data.exactMatchPoints ?? 5,
        data.directionMatchPoints ?? 1,
      );
      const stored = isLegacy ? "{}" : data.stagePoints;
      const loaded = loadStagePoints(stored, globalBase);

      const savedMap: Partial<Record<string, { exact: number; direction: number }>> =
        stored ? JSON.parse(stored) : {};
      const globalParsed: Partial<Record<string, { exact: number; direction: number }>> =
        globalSettings?.stagePoints ? (() => { try { return JSON.parse(globalSettings.stagePoints); } catch { return {}; } })() : {};
      const advancementPoints = savedMap["Advancement"]
        ? { exact: savedMap["Advancement"].exact, direction: savedMap["Advancement"].direction }
        : globalParsed["Advancement"]
          ? { exact: globalParsed["Advancement"].exact, direction: globalParsed["Advancement"].direction }
          : DEFAULT_ADVANCEMENT_POINTS;

      setSettings({
        stagePoints: loaded,
        advancementPoints,
        isPublic: data.isPublic ?? true,
        requirePassword: data.requirePassword ?? false,
        avatar: data.avatar ?? null,
      });
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

    // Load existing open join link (stored on group)
    fetch(`/api/groups/${groupId}`)
      .then((r) => r.json())
      .then((d: { joinToken?: string | null }) => {
        if (d.joinToken) {
          setJoinUrl(`${window.location.origin}/join/${d.joinToken}`);
        }
      });
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
    const member = memberships.find((m) => m.userId === userId);
    const label = member?.user.name ?? member?.user.email ?? "this member";
    if (!confirm(`Remove ${label} from the group? This cannot be undone.`)) return;
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
      const result = await res.json();
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
      if (result.emailSent) {
        setInviteMessage({ ok: true, text: `Invite email sent to ${inviteEmail.trim()}` });
        setInviteLink(null);
        setTimeout(() => setInviteMessage(null), 4000);
      } else {
        setInviteMessage({ ok: true, text: "Invite created — email unavailable, share this link manually:" });
        setInviteLink(result.inviteUrl);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      setInviteMessage({ ok: false, text: (err as { error?: string }).error ?? "Failed to create invite" });
      setTimeout(() => setInviteMessage(null), 4000);
    }
    setInviteSending(false);
  };

  const handleResendInvite = async (inv: PendingInvite) => {
    const res = await fetch(`/api/groups/${groupId}/invite/${inv.id}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setPendingInvites((prev) =>
        prev.map((p) =>
          p.id === inv.id
            ? { ...p, id: data.invite.id, expiresAt: data.invite.expiresAt, createdAt: new Date().toISOString() }
            : p
        )
      );
      if (data.emailSent) {
        setInviteMessage({ ok: true, text: `Invite re-sent to ${inv.email}` });
        setInviteLink(null);
        setTimeout(() => setInviteMessage(null), 3500);
      } else {
        // Email unavailable — surface the link so the admin can share manually.
        setInviteMessage({ ok: true, text: `Invite refreshed — email unavailable, share this link manually:` });
        setInviteLink(data.inviteUrl);
      }
    } else {
      setInviteMessage({ ok: false, text: "Failed to resend invite" });
      setTimeout(() => setInviteMessage(null), 3500);
    }
  };

  const handleGenerateJoinLink = async () => {
    setJoinLinkLoading(true);
    const res = await fetch(`/api/admin/groups/${groupId}/join-link`, { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      setJoinUrl(d.joinUrl);
    }
    setJoinLinkLoading(false);
  };

  const handleRevokeJoinLink = async () => {
    setJoinLinkLoading(true);
    await fetch(`/api/admin/groups/${groupId}/join-link`, { method: "DELETE" });
    setJoinUrl(null);
    setJoinLinkLoading(false);
  };

  const handleAddMember = async () => {
    const userId = addMemberInput.trim();
    if (!userId) return;
    setAddMemberSaving(true);
    const res = await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, memberRole: addMemberRole, notify: addMemberNotify }),
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
            memberRole: addMemberRole,
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
        stagePoints: JSON.stringify({ ...settings.stagePoints, Advancement: settings.advancementPoints }),
        isPublic: settings.isPublic,
        requirePassword: settings.requirePassword,
        avatar: settings.avatar,
      }),
    });
    setSettingsSaving(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  // ── Custom prediction handlers ────────────────────────────────────────────────
  const handleCreateCustomPrediction = async () => {
    if (!cpForm.question.trim() || !cpForm.lockTime) return;
    const cleanOptions = cpForm.options.map((o) => o.trim()).filter(Boolean);
    if (cpForm.optionType === "FIXED" && cleanOptions.length < 2) return;
    setCpCreating(true);
    const body: Record<string, unknown> = {
      question: cpForm.question.trim(),
      optionType: cpForm.optionType,
      points: cpForm.points,
      lockTime: new Date(cpForm.lockTime).toISOString(),
      groupId,
    };
    if (cpForm.optionType === "FIXED") body.options = cleanOptions;
    const res = await fetch("/api/admin/custom-predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setCpForm({ question: "", optionType: "FIXED", options: ["", ""], points: 3, lockTime: "" });
      const updated = await fetch(`/api/admin/custom-predictions?groupId=${groupId}`).then((r) => r.json());
      setCustomPredictions(updated);
    }
    setCpCreating(false);
  };

  const handleBatchImport = async () => {
    setImportError("");
    let parsed: unknown[];
    try {
      parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error("Must be a JSON array");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    setImporting(true);
    const res = await fetch("/api/admin/custom-predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: true, groupId, predictions: parsed }),
    });
    if (res.ok) {
      const d = await res.json();
      setImportJson("");
      const updated = await fetch(`/api/admin/custom-predictions?groupId=${groupId}`).then((r) => r.json());
      setCustomPredictions(updated);
      setImportError(`✓ Imported ${d.created} prediction${d.created !== 1 ? "s" : ""}`);
    } else {
      setImportError("Import failed");
    }
    setImporting(false);
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
      setEpRevealed({});
      return;
    }
    setEpLoading(true);
    setEpRevealed({});
    fetch(`/api/admin/matches/${epMatchId}/predictions?groupId=${groupId}`)
      .then((r) => r.json())
      .then((data: PredictionRow[]) => {
        setEpPredictions(data);
        const inputs: Record<string, { home: string; away: string }> = {};
        data.forEach((p) => {
          inputs[p.userId] = {
            home: p.homeScore != null ? String(p.homeScore) : "",
            away: p.awayScore != null ? String(p.awayScore) : "",
          };
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

        {/* Open join link */}
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Shareable Join Link
          </p>
          <p className="text-xs text-gray-400 mb-2">Anyone with this link is approved immediately as a Member.</p>
          {joinUrl ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={joinUrl}
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50 text-gray-600 font-mono"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(joinUrl)}
                  className="text-xs text-fifa-blue hover:underline shrink-0"
                >
                  Copy
                </button>
              </div>
              <button
                onClick={handleRevokeJoinLink}
                disabled={joinLinkLoading}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
              >
                {joinLinkLoading ? "…" : "Revoke link"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateJoinLink}
              disabled={joinLinkLoading}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 disabled:opacity-40"
            >
              {joinLinkLoading ? "Generating…" : "Generate Join Link"}
            </button>
          )}
        </div>

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
              <option value="ADMIN">Admin</option>
              <option value="GROUP_ADMIN">Group Admin</option>
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
          {inviteLink && (
            <div className="mt-1.5 flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50 text-gray-600 font-mono"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(inviteLink); }}
                className="text-xs text-fifa-blue hover:underline shrink-0"
              >
                Copy
              </button>
            </div>
          )}
          {pendingInvites.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-400 font-medium">Pending invites:</p>
              {pendingInvites.map((inv) => {
                const expired = new Date(inv.expiresAt) < new Date();
                return (
                  <div key={inv.id} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-medium truncate max-w-[140px]">{inv.email}</span>
                    <span className="text-gray-300">·</span>
                    <span>{inv.memberRole === "VISITOR_ADMIN" ? "Visitor Admin" : "Member"}</span>
                    <span className="text-gray-300">·</span>
                    <span className={expired ? "text-red-400" : "text-gray-400"}>{formatExpiry(inv.expiresAt)}</span>
                    <button
                      onClick={() => handleResendInvite(inv)}
                      className="ml-auto text-xs text-fifa-blue hover:underline shrink-0"
                    >
                      Resend
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add a user directly to this group */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Add a User to this Group
          </p>
          <p className="text-xs text-gray-400 mb-2">
            Skips the invite flow — the user is added immediately. Tick <em>Notify them</em> to send an in-app + push notification.
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
              <option value="ADMIN">Admin</option>
              <option value="GROUP_ADMIN">Group Admin</option>
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
          <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addMemberNotify}
              onChange={(e) => setAddMemberNotify(e.target.checked)}
              className="rounded border-gray-300 text-fifa-blue focus:ring-fifa-blue"
            />
            ✉️ Notify them they were added
          </label>
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
                      {m.memberRole !== "MEMBER" && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          m.memberRole === "ADMIN" ? "bg-amber-100 text-amber-800" :
                          m.memberRole === "GROUP_ADMIN" ? "bg-blue-100 text-blue-700" :
                          "bg-purple-100 text-purple-700"
                        }`}>
                          {m.memberRole === "ADMIN" ? "Admin" : m.memberRole === "GROUP_ADMIN" ? "Group Admin" : "Visitor"}
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

      {/* ── Demo bots ────────────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Demo Predictors</p>

        {/* Monkey — random fills, fully per-group */}
        {(() => {
          const syncKey = "monkey-POST";
          const removeKey = "monkey-DELETE";
          return (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">🐒 Monkey</p>
                <p className="text-xs text-gray-400 mt-0.5">Fills all missing predictions with random picks. Attackers for scorer awards.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleBotAction("monkey", "POST")}
                  disabled={botLoading[syncKey]}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-50"
                >
                  {botLoading[syncKey] ? "…" : "Add / Re-sync"}
                </button>
                <button
                  onClick={() => handleBotAction("monkey", "DELETE")}
                  disabled={botLoading[removeKey]}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                >
                  {botLoading[removeKey] ? "…" : "Remove"}
                </button>
                {(botMessage[syncKey] || botMessage[removeKey]) && (
                  <span className="text-[10px] text-gray-400">{botMessage[syncKey] || botMessage[removeKey]}</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Claudio — singleton AI predictor managed globally by admin */}
        {(() => {
          const addKey = "claudio-POST";
          const removeKey = "claudio-DELETE";
          return (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">🧠 Claudio</p>
                <p className="text-xs text-gray-400 mt-0.5">AI predictor managed globally by the admin. Adding copies his existing predictions into this group.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleBotAction("claudio", "POST")}
                  disabled={botLoading[addKey]}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition disabled:opacity-50"
                >
                  {botLoading[addKey] ? "…" : "Add to Group"}
                </button>
                <button
                  onClick={() => handleBotAction("claudio", "DELETE")}
                  disabled={botLoading[removeKey]}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                >
                  {botLoading[removeKey] ? "…" : "Remove"}
                </button>
                {(botMessage[addKey] || botMessage[removeKey]) && (
                  <span className="text-[10px] text-gray-400">{botMessage[addKey] || botMessage[removeKey]}</span>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── B. Group Settings ────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-1">Group Settings</h3>
        <p className="text-xs text-gray-400 mb-4">
          Points awarded to members of this group for correct predictions. Defaults are seeded from the <strong>global Point Defaults</strong> (Admin → Point Defaults) at group creation. Use <em>Reset to global defaults</em> to re-apply them.
        </p>
        {!settingsLoaded ? (
          <div className="text-sm text-gray-400 py-2">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium text-center w-24">Exact</th>
                    <th className="px-3 py-2 font-medium text-center w-28">Directional</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((stage) => {
                    const val = settings.stagePoints[stage];
                    return (
                      <tr key={stage} className="border-b border-gray-50">
                        <td className="py-2 pr-4 text-gray-700 font-medium whitespace-nowrap">{stage}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={val.exact}
                            onChange={(e) =>
                              setSettings((s) => ({
                                ...s,
                                stagePoints: {
                                  ...s.stagePoints,
                                  [stage]: { ...s.stagePoints[stage], exact: Number(e.target.value) },
                                },
                              }))
                            }
                            className="w-16 border border-gray-300 rounded-md px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={val.direction}
                            onChange={(e) =>
                              setSettings((s) => ({
                                ...s,
                                stagePoints: {
                                  ...s.stagePoints,
                                  [stage]: { ...s.stagePoints[stage], direction: Number(e.target.value) },
                                },
                              }))
                            }
                            className="w-16 border border-gray-300 rounded-md px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {/* Advancement picks row */}
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-2 pr-4 font-medium whitespace-nowrap">
                      <span className="text-gray-700">Advancement picks</span>
                      <span className="ml-1.5 text-xs text-gray-400" title="Exact = correct team + correct method (Winner/Runner-up/3rd). Directional = correct team but wrong method.">ⓘ</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={settings.advancementPoints.exact}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            advancementPoints: { ...s.advancementPoints, exact: Number(e.target.value) },
                          }))
                        }
                        className="w-16 border border-gray-300 rounded-md px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={settings.advancementPoints.direction}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            advancementPoints: { ...s.advancementPoints, direction: Number(e.target.value) },
                          }))
                        }
                        className="w-16 border border-gray-300 rounded-md px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Avatar</label>
              {settings.avatar && !isEmojiAvatar(settings.avatar) ? (
                <div className="flex items-center gap-3">
                  <Image src={settings.avatar} alt="" width={36} height={36} className="rounded-full object-cover" />
                  <span className="text-xs text-gray-400">Custom image avatar — pick an emoji below to replace it.</span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {GROUP_EMOJI_OPTIONS.map((emoji) => {
                  const selected = settings.avatar === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, avatar: selected ? null : emoji }))}
                      className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center border transition ${
                        selected
                          ? "border-fifa-blue bg-blue-50 ring-2 ring-fifa-blue"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                      aria-label={`Avatar ${emoji}`}
                      aria-pressed={selected}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-3 mb-1.5">Or pick a team flag</p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                {Object.entries(WC_GROUPS).flatMap(([wcGroup, teams]) =>
                  teams.map((team) => {
                    const flag = getFlag(team);
                    const selected = settings.avatar === flag;
                    return (
                      <button
                        key={team}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, avatar: selected ? null : flag }))}
                        title={`${team} (Group ${wcGroup})`}
                        className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center border transition ${
                          selected
                            ? "border-fifa-blue bg-blue-50 ring-2 ring-fifa-blue"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                        aria-label={`${team} flag`}
                        aria-pressed={selected}
                      >
                        {flag}
                      </button>
                    );
                  })
                )}
              </div>
              {settings.avatar && (
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, avatar: null }))}
                  className="text-[10px] text-gray-400 hover:text-red-500 mt-1.5"
                >
                  Clear avatar
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Visibility</label>
              <div className="relative group inline-flex">
                <div className="flex rounded-lg border border-gray-300 text-sm overflow-hidden">
                  <button type="button" onClick={() => setSettings((s) => ({ ...s, isPublic: false }))}
                    className={`px-3 py-2 flex items-center gap-1.5 transition ${!settings.isPublic ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                    🔒 Private
                  </button>
                  <button type="button" onClick={() => setSettings((s) => ({ ...s, isPublic: true }))}
                    className={`px-3 py-2 flex items-center gap-1.5 transition border-l border-gray-300 ${settings.isPublic ? "bg-fifa-blue text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                    🌐 Public
                  </button>
                </div>
                <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-10 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg pointer-events-none">
                  <p><strong className="text-white">🔒 Private</strong> — Only users with a join link or email invite can access.</p>
                  <p className="mt-1.5"><strong className="text-white">🌐 Public</strong> — Anyone can find and request to join via the Groups search page.</p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Invite Sign-up</label>
              <div className="relative group inline-flex">
                <div className="flex rounded-lg border border-gray-300 text-sm overflow-hidden">
                  <button type="button" onClick={() => setSettings((s) => ({ ...s, requirePassword: false }))}
                    className={`px-3 py-2 flex items-center gap-1.5 transition ${!settings.requirePassword ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                    👤 Name only
                  </button>
                  <button type="button" onClick={() => setSettings((s) => ({ ...s, requirePassword: true }))}
                    className={`px-3 py-2 flex items-center gap-1.5 transition border-l border-gray-300 ${settings.requirePassword ? "bg-fifa-blue text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                    🔑 Require password
                  </button>
                </div>
                <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-10 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg pointer-events-none">
                  <p><strong className="text-white">👤 Name only</strong> — Invited users join by entering just their name.</p>
                  <p className="mt-1.5"><strong className="text-white">🔑 Require password</strong> — Invited users must set a password. They can use it to sign in later.</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSaveSettings}
                disabled={settingsSaving}
                className="btn-primary disabled:opacity-50"
              >
                {settingsSaving ? "Saving…" : settingsSaved ? "Saved ✓" : "Save Settings"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/admin/settings");
                    const data = await res.json();
                    const stagePoints = loadStagePoints(data.stagePoints);
                    let advancementPoints = DEFAULT_ADVANCEMENT_POINTS;
                    try {
                      const parsed = JSON.parse(data.stagePoints || "{}");
                      if (parsed?.Advancement?.exact != null && parsed.Advancement.direction != null) {
                        advancementPoints = { exact: parsed.Advancement.exact, direction: parsed.Advancement.direction };
                      }
                    } catch {}
                    setSettings((s) => ({ ...s, stagePoints, advancementPoints }));
                  } catch {
                    setSettings((s) => ({ ...s, stagePoints: defaultStagePoints(), advancementPoints: DEFAULT_ADVANCEMENT_POINTS }));
                  }
                }}
                className="text-xs text-gray-500 hover:text-fifa-blue transition"
              >
                Reset to global defaults
              </button>
            </div>
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
              {!isLocked ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
                  🙈 <strong>Predictions are hidden until lock.</strong> To prevent admins from updating their own pick after seeing other members&apos;, scores are revealed only after the match locks (1h before kickoff).
                </div>
              ) : (
                <div className="rounded-lg bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 text-sm">
                  🔒 <strong>Match is locked.</strong> Predictions are hidden by default — click <em>Reveal</em> on a row only when a member has asked you to change theirs. Your own prediction can&apos;t be edited.
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
                        const input = epInputs[pred.userId] ?? { home: "", away: "" };
                        const isSelf = pred.userId === adminUserId;
                        const revealed = epRevealed[pred.userId];
                        // Three states:
                        // - !isLocked → server returned hidden values; admin can't see or edit anyone's
                        // - isLocked && !revealed → mask as *-* with a Reveal button
                        // - isLocked && revealed → show values + edit inputs (except own row)
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
                                <span className="font-medium text-gray-800">{pred.userName}{isSelf ? " (you)" : ""}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {!isLocked || !revealed ? (
                                <span className="font-mono text-gray-400 select-none">*–*</span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number" min="0" max="20" value={input.home}
                                    disabled={isSelf}
                                    onChange={(e) =>
                                      setEpInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], home: e.target.value } }))
                                    }
                                    className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue disabled:bg-gray-100 disabled:text-gray-400"
                                  />
                                  <span className="text-gray-400">–</span>
                                  <input
                                    type="number" min="0" max="20" value={input.away}
                                    disabled={isSelf}
                                    onChange={(e) =>
                                      setEpInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], away: e.target.value } }))
                                    }
                                    className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue disabled:bg-gray-100 disabled:text-gray-400"
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
                              {!isLocked ? (
                                <span className="text-xs text-gray-400">🙈</span>
                              ) : !revealed ? (
                                <button
                                  onClick={() => {
                                    // Fetch the actual value once revealed (server returns it post-lock)
                                    setEpRevealed((p) => ({ ...p, [pred.userId]: true }));
                                    setEpInputs((p) => ({
                                      ...p,
                                      [pred.userId]: {
                                        home: pred.homeScore != null ? String(pred.homeScore) : "",
                                        away: pred.awayScore != null ? String(pred.awayScore) : "",
                                      },
                                    }));
                                  }}
                                  className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                                >
                                  Reveal
                                </button>
                              ) : isSelf ? (
                                <span className="text-xs text-gray-400">🔒 own</span>
                              ) : (
                                <button
                                  onClick={() => handleSavePrediction(pred.userId)}
                                  disabled={epSaving[pred.userId]}
                                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                                >
                                  {epSaving[pred.userId] ? "…" : epSaved.has(pred.userId) ? "Saved ✓" : "✎ Save"}
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
              <label className="block text-xs text-gray-500 mb-1">Answer type</label>
              <div className="flex gap-2 flex-wrap">
                {(["FIXED", "TEAM", "PLAYER"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCpForm((f) => ({ ...f, optionType: t }))}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition ${cpForm.optionType === t ? "bg-fifa-blue text-white border-fifa-blue" : "border-gray-300 text-gray-600 hover:border-fifa-blue"}`}
                  >
                    {t === "FIXED" ? "Custom options" : t === "TEAM" ? "⚽ Team" : "🧑 Player"}
                  </button>
                ))}
              </div>
              {cpForm.optionType === "TEAM" && <p className="text-xs text-gray-400 mt-1">Users will pick from the list of all 48 WC2026 teams.</p>}
              {cpForm.optionType === "PLAYER" && <p className="text-xs text-gray-400 mt-1">Users will type a player name (free text).</p>}
            </div>
            {cpForm.optionType === "FIXED" && (
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
                          onClick={() => setCpForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }))}
                          className="text-red-400 hover:text-red-600 text-sm px-2"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setCpForm((f) => ({ ...f, options: [...f.options, ""] }))}
                    className="text-xs text-fifa-blue hover:underline"
                  >
                    + Add option
                  </button>
                </div>
              </div>
            )}
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

        {/* Batch import */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-700 text-sm">Batch Import</h4>
            <button onClick={() => setImportShowHelp((p) => !p)} className="text-xs text-fifa-blue hover:underline">
              {importShowHelp ? "Hide format" : "Show format"}
            </button>
          </div>
          {importShowHelp && (
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 overflow-x-auto mb-3 leading-relaxed">{`[\n  { "question": "Who wins?", "optionType": "TEAM", "points": 5, "lockTime": "2026-06-11T18:00:00Z" },\n  { "question": "Top scorer?", "optionType": "PLAYER", "points": 8, "lockTime": "2026-06-11T18:00:00Z" },\n  { "question": "Total goals?", "optionType": "FIXED", "options": ["<100","100-149","150+"], "points": 3, "lockTime": "2026-07-19T00:00:00Z" }\n]`}</pre>
          )}
          <textarea
            value={importJson}
            onChange={(e) => { setImportJson(e.target.value); setImportError(""); }}
            placeholder="Paste JSON array of predictions…"
            rows={4}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fifa-blue resize-none"
          />
          {importError && (
            <p className={`text-xs mt-1 ${importError.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{importError}</p>
          )}
          <button
            onClick={handleBatchImport}
            disabled={importing || !importJson.trim()}
            className="mt-2 text-xs px-3 py-1.5 rounded-lg font-semibold border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 disabled:opacity-40"
          >
            {importing ? "Importing…" : "Import Predictions"}
          </button>
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
                      {cp.optionType === "PLAYER" ? (
                        <input
                          type="text"
                          value={cpResolving[cp.id] ?? ""}
                          onChange={(e) => setCpResolving((p) => ({ ...p, [cp.id]: e.target.value }))}
                          placeholder="Enter correct player name…"
                          className="flex-1 min-w-40 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        />
                      ) : (
                        <select
                          value={cpResolving[cp.id] ?? ""}
                          onChange={(e) => setCpResolving((p) => ({ ...p, [cp.id]: e.target.value }))}
                          className="flex-1 min-w-32 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        >
                          <option value="">— select —</option>
                          {cp.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleResolvePrediction(cp.id)}
                        disabled={!cpResolving[cp.id]?.trim() || cpResolvingSaving[cp.id]}
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

      {/* ── E. Prediction Fill State ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Prediction Fill State</h3>
          <button
            onClick={async () => {
              if (predStatsLoaded) { setPredStatsLoaded(false); setPredStats(null); return; }
              setPredStatsLoading(true);
              const data = await fetch(`/api/admin/groups/${groupId}/prediction-stats`).then((r) => r.json());
              setPredStats(data);
              setPredStatsLoading(false);
              setPredStatsLoaded(true);
            }}
            disabled={predStatsLoading}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-50"
          >
            {predStatsLoading ? "Loading…" : predStatsLoaded ? "Hide" : "Load"}
          </button>
        </div>

        {predStatsLoaded && predStats && (
          <div className="card overflow-hidden p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold text-center">Global Preds</th>
                    <th className="px-4 py-3 font-semibold text-center">Advancement</th>
                    <th className="px-4 py-3 font-semibold text-center">Group Stage</th>
                    <th className="px-4 py-3 font-semibold text-center">Knockout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {predStats.stats.map((member) => {
                    const cols = [
                      { done: member.customPredictions, total: predStats.totals.customPredictions },
                      { done: member.advancementPicks, total: predStats.totals.advancementPicks },
                      { done: member.matchGroupStage, total: predStats.totals.matchGroupStage },
                      { done: member.matchKnockout, total: predStats.totals.matchKnockout },
                    ];
                    return (
                      <tr key={member.userId} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {member.userImage ? (
                              <img src={member.userImage} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-200 shrink-0" />
                            )}
                            <span className="font-medium text-gray-800 truncate max-w-[120px]">{member.userName}</span>
                            {member.memberRole === "VISITOR_ADMIN" && (
                              <span className="text-[10px] text-gray-400 border border-gray-200 rounded px-1">visitor</span>
                            )}
                          </div>
                        </td>
                        {cols.map((col, i) => {
                          const pct = col.total > 0 ? Math.round((col.done / col.total) * 100) : 100;
                          const allDone = col.done === col.total;
                          const none = col.done === 0;
                          return (
                            <td key={i} className="px-4 py-3 text-center">
                              {col.total === 0 ? (
                                <span className="text-xs text-gray-300">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <span className={`text-xs font-semibold ${allDone ? "text-green-600" : none ? "text-gray-400" : "text-amber-600"}`}>
                                    {col.done}
                                  </span>
                                  <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${allDone ? "bg-green-400" : none ? "bg-gray-200" : "bg-amber-400"}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
        )}
      </div>
    </div>
  );
}
