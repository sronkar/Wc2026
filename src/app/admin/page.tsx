"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface Match {
  id: string;
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  group: string | null;
  round: string;
  venue: string;
  city: string;
  kickoff: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

interface Settings {
  exactMatchPoints: number;
  directionMatchPoints: number;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  createdAt: string;
}

interface GroupAdmin {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  exactMatchPoints: number;
  directionMatchPoints: number;
  createdAt: string;
  memberships: {
    userId: string;
    status: string;
    createdAt: string;
    user: { id: string; name: string | null; email: string | null; image: string | null };
  }[];
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

interface PredictionRow {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  homeScore: number;
  awayScore: number;
  points: number | null;
}

type Tab = "results" | "predictions" | "settings" | "users" | "custom" | "groups";

const ROUNDS = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
];

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";

  // ── Results tab state ────────────────────────────────────────────────────────
  const [matches, setMatches] = useState<Match[]>([]);
  const [resultInputs, setResultInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedMatches, setSavedMatches] = useState<Set<string>>(new Set());
  const [roundFilter, setRoundFilter] = useState("Group Stage");

  // ── Settings tab state (admin only) ─────────────────────────────────────────
  const [settings, setSettings] = useState<Settings>({ exactMatchPoints: 5, directionMatchPoints: 1 });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<{
    updated: number;
    checked: number;
    matches: { matchNumber: number; home: string; away: string; score: string }[];
    source: string | null;
    error?: string;
  } | null>(null);

  // ── Users tab state (admin only) ─────────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<Record<string, boolean>>({});

  // ── Predictions tab state ────────────────────────────────────────────────────
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [matchPredictions, setMatchPredictions] = useState<PredictionRow[]>([]);
  const [predInputs, setPredInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [loadingPreds, setLoadingPreds] = useState(false);
  const [savingPred, setSavingPred] = useState<Record<string, boolean>>({});
  const [savedPreds, setSavedPreds] = useState<Set<string>>(new Set());

  // ── Custom predictions tab state (admin only) ────────────────────────────────
  const [customPredictions, setCustomPredictions] = useState<CustomPredictionAdmin[]>([]);
  const [customLoaded, setCustomLoaded] = useState(false);
  const [cpForm, setCpForm] = useState({ question: "", options: ["", ""], points: 3, lockTime: "", groupId: "" });
  const [cpCreating, setCpCreating] = useState(false);
  const [cpGroups, setCpGroups] = useState<{ id: string; name: string }[]>([]);
  const [cpGroupsLoaded, setCpGroupsLoaded] = useState(false);
  const [cpResolving, setcpResolving] = useState<Record<string, string>>({});
  const [cpResolvingSaving, setCpResolvingSaving] = useState<Record<string, boolean>>({});
  const [cpDeleting, setCpDeleting] = useState<Record<string, boolean>>({});

  // ── Groups tab state (admin only) ────────────────────────────────────────────
  const [groups, setGroups] = useState<GroupAdmin[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", description: "", avatar: "", exactMatchPoints: 5, directionMatchPoints: 1 });
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupDeleting, setGroupDeleting] = useState<Record<string, boolean>>({});
  const [memberUpdating, setMemberUpdating] = useState<Record<string, boolean>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupEditForms, setGroupEditForms] = useState<Record<string, { name: string; description: string; avatar: string; exactMatchPoints: number; directionMatchPoints: number }>>({});
  const [groupEditSaving, setGroupEditSaving] = useState<Record<string, boolean>>({});
  const [addMemberInputs, setAddMemberInputs] = useState<Record<string, string>>({});
  const [addMemberSaving, setAddMemberSaving] = useState<Record<string, boolean>>({});
  const [addMemberMessages, setAddMemberMessages] = useState<Record<string, { ok: boolean; text: string }>>({});

  // ── Predictions tab group selector ───────────────────────────────────────────
  const [predGroupId, setPredGroupId] = useState("");
  const [predGroups, setPredGroups] = useState<{ id: string; name: string }[]>([]);
  const [predGroupsLoaded, setPredGroupsLoaded] = useState(false);

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("results");

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "loading") return;
    if (!session || (role !== "ADMIN" && role !== "SUB_ADMIN")) {
      router.replace("/");
    }
  }, [session, status, router, role]);

  // ── Initial data load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || (role !== "ADMIN" && role !== "SUB_ADMIN")) return;

    async function load() {
      const mRes = await fetch("/api/matches");
      const mData: Match[] = await mRes.json();
      setMatches(mData);

      const inputs: Record<string, { home: string; away: string }> = {};
      mData.forEach((m) => {
        inputs[m.id] = {
          home: m.homeScore !== null ? String(m.homeScore) : "",
          away: m.awayScore !== null ? String(m.awayScore) : "",
        };
      });
      setResultInputs(inputs);

      if (role === "ADMIN") {
        const sRes = await fetch("/api/admin/settings");
        const sData: Settings = await sRes.json();
        if (sData) setSettings(sData);
      }
    }
    load();
  }, [session, role]);

  // ── Load users when Users tab is first opened ────────────────────────────────
  useEffect(() => {
    if (activeTab !== "users" || usersLoaded || !isAdmin) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: UserRow[]) => {
        setUsers(data);
        setUsersLoaded(true);
      });
  }, [activeTab, usersLoaded, isAdmin]);

  // ── Load groups when Groups tab is first opened (also loads users for add-member) ─
  useEffect(() => {
    if (activeTab !== "groups" || groupsLoaded || !isAdmin) return;
    Promise.all([
      fetch("/api/admin/groups").then((r) => r.json()),
      usersLoaded ? Promise.resolve(null) : fetch("/api/admin/users").then((r) => r.json()),
    ]).then(([gData, uData]) => {
      setGroups(gData as GroupAdmin[]);
      if (uData) { setUsers(uData as UserRow[]); setUsersLoaded(true); }
      setGroupsLoaded(true);
    });
  }, [activeTab, groupsLoaded, isAdmin, usersLoaded]);

  // ── Load groups for predictions tab group selector ───────────────────────────
  useEffect(() => {
    if (activeTab !== "predictions" || predGroupsLoaded || !session) return;
    fetch("/api/admin/groups")
      .then((r) => r.json())
      .then((data: GroupAdmin[]) => {
        setPredGroups(data.map((g) => ({ id: g.id, name: g.name })));
        setPredGroupsLoaded(true);
      });
  }, [activeTab, predGroupsLoaded, session]);

  // ── Load custom predictions when Custom tab is first opened ──────────────────
  useEffect(() => {
    if (activeTab !== "custom" || !isAdmin) return;
    if (!cpGroupsLoaded) {
      fetch("/api/admin/groups")
        .then((r) => r.json())
        .then((data: GroupAdmin[]) => {
          setCpGroups(data.map((g) => ({ id: g.id, name: g.name })));
          setCpGroupsLoaded(true);
        });
    }
    if (!customLoaded) {
      fetch("/api/admin/custom-predictions")
        .then((r) => r.json())
        .then((data: CustomPredictionAdmin[]) => {
          setCustomPredictions(data);
          setCustomLoaded(true);
        });
    }
  }, [activeTab, customLoaded, cpGroupsLoaded, isAdmin]);

  // ── Load predictions when a match+group is selected ──────────────────────────
  useEffect(() => {
    if (!selectedMatchId || !predGroupId) {
      setMatchPredictions([]);
      setPredInputs({});
      return;
    }
    setLoadingPreds(true);
    fetch(`/api/admin/matches/${selectedMatchId}/predictions?groupId=${predGroupId}`)
      .then((r) => r.json())
      .then((data: PredictionRow[]) => {
        setMatchPredictions(data);
        const inputs: Record<string, { home: string; away: string }> = {};
        data.forEach((p) => {
          inputs[p.userId] = { home: String(p.homeScore), away: String(p.awayScore) };
        });
        setPredInputs(inputs);
      })
      .finally(() => setLoadingPreds(false));
  }, [selectedMatchId, predGroupId]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handlePollScores = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/admin/poll", { method: "POST" });
      const data = await res.json();
      setPollResult(data);
      if (data.updated > 0) {
        const mRes = await fetch("/api/matches");
        const mData: Match[] = await mRes.json();
        setMatches(mData);
        const inputs: Record<string, { home: string; away: string }> = {};
        mData.forEach((m) => {
          inputs[m.id] = {
            home: m.homeScore !== null ? String(m.homeScore) : "",
            away: m.awayScore !== null ? String(m.awayScore) : "",
          };
        });
        setResultInputs(inputs);
      }
    } finally {
      setPolling(false);
    }
  };

  const handleSaveResult = async (matchId: string) => {
    const input = resultInputs[matchId];
    if (!input) return;
    const home = parseInt(input.home, 10);
    const away = parseInt(input.away, 10);
    if (isNaN(home) || isNaN(away)) return;

    setSaving((prev) => ({ ...prev, [matchId]: true }));
    await fetch("/api/admin/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, homeScore: home, awayScore: away }),
    });
    setSaving((prev) => ({ ...prev, [matchId]: false }));
    setSavedMatches((prev) => new Set(Array.from(prev).concat(matchId)));
    setTimeout(
      () => setSavedMatches((prev) => { const s = new Set(Array.from(prev)); s.delete(matchId); return s; }),
      2000
    );
    setMatches((prev) =>
      prev.map((m) => m.id === matchId ? { ...m, homeScore: home, awayScore: away, status: "FINISHED" } : m)
    );
  };

  const handleSaveSettings = async () => {
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "SUB_ADMIN" ? "USER" : "SUB_ADMIN";
    setRoleUpdating((prev) => ({ ...prev, [userId]: true }));
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const updated: UserRow = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: updated.role } : u));
    }
    setRoleUpdating((prev) => ({ ...prev, [userId]: false }));
  };

  const handleSavePrediction = async (userId: string) => {
    const input = predInputs[userId];
    if (!input || !selectedMatchId || !predGroupId) return;
    const home = parseInt(input.home, 10);
    const away = parseInt(input.away, 10);
    if (isNaN(home) || isNaN(away)) return;

    setSavingPred((prev) => ({ ...prev, [userId]: true }));
    await fetch("/api/admin/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, matchId: selectedMatchId, groupId: predGroupId, homeScore: home, awayScore: away }),
    });
    setSavingPred((prev) => ({ ...prev, [userId]: false }));
    setSavedPreds((prev) => new Set(Array.from(prev).concat(userId)));
    setTimeout(
      () => setSavedPreds((prev) => { const s = new Set(Array.from(prev)); s.delete(userId); return s; }),
      2000
    );
    setMatchPredictions((prev) =>
      prev.map((p) => p.userId === userId ? { ...p, homeScore: home, awayScore: away } : p)
    );
  };

  // ── Groups handlers ───────────────────────────────────────────────────────────

  const handleCreateGroup = async () => {
    if (!groupForm.name.trim()) return;
    setGroupCreating(true);
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || null,
        avatar: groupForm.avatar.trim() || null,
        exactMatchPoints: groupForm.exactMatchPoints,
        directionMatchPoints: groupForm.directionMatchPoints,
      }),
    });
    if (res.ok) {
      const created: GroupAdmin = await res.json();
      setGroups((prev) => [...prev, created]);
      setGroupForm({ name: "", description: "", avatar: "", exactMatchPoints: 5, directionMatchPoints: 1 });
    }
    setGroupCreating(false);
  };

  const handleSaveGroupEdit = async (groupId: string) => {
    const form = groupEditForms[groupId];
    if (!form?.name.trim()) return;
    setGroupEditSaving((p) => ({ ...p, [groupId]: true }));
    const res = await fetch(`/api/admin/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        avatar: form.avatar.trim() || null,
        exactMatchPoints: form.exactMatchPoints,
        directionMatchPoints: form.directionMatchPoints,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, ...updated } : g));
      setEditingGroup(null);
    }
    setGroupEditSaving((p) => ({ ...p, [groupId]: false }));
  };

  const handleAddMember = async (groupId: string) => {
    const userId = addMemberInputs[groupId]?.trim();
    if (!userId) return;
    setAddMemberSaving((p) => ({ ...p, [groupId]: true }));
    const res = await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const { membership, user: addedUser } = await res.json();
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          const existing = g.memberships.find((m) => m.userId === membership.userId);
          if (existing) {
            return { ...g, memberships: g.memberships.map((m) => m.userId === membership.userId ? { ...m, status: "APPROVED" } : m) };
          }
          return { ...g, memberships: [...g.memberships, { userId: membership.userId, status: "APPROVED", createdAt: membership.createdAt, user: addedUser }] };
        })
      );
      setAddMemberInputs((p) => ({ ...p, [groupId]: "" }));
      setAddMemberMessages((p) => ({ ...p, [groupId]: { ok: true, text: `${addedUser.name ?? addedUser.email} added!` } }));
    } else {
      const err = await res.json().catch(() => ({}));
      setAddMemberMessages((p) => ({ ...p, [groupId]: { ok: false, text: err.error ?? "Failed to add member" } }));
    }
    setAddMemberSaving((p) => ({ ...p, [groupId]: false }));
    setTimeout(() => setAddMemberMessages((p) => { const n = { ...p }; delete n[groupId]; return n; }), 3000);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Delete this group and all its memberships?")) return;
    setGroupDeleting((p) => ({ ...p, [groupId]: true }));
    const res = await fetch(`/api/admin/groups/${groupId}`, { method: "DELETE" });
    if (res.ok) setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setGroupDeleting((p) => ({ ...p, [groupId]: false }));
  };

  const handleMemberStatus = async (groupId: string, userId: string, status: "APPROVED" | "REJECTED") => {
    const key = `${groupId}:${userId}`;
    setMemberUpdating((p) => ({ ...p, [key]: true }));
    const res = await fetch(`/api/admin/groups/${groupId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id !== groupId ? g : {
            ...g,
            memberships: g.memberships.map((m) =>
              m.userId === userId ? { ...m, status } : m
            ),
          }
        )
      );
    }
    setMemberUpdating((p) => ({ ...p, [key]: false }));
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    const key = `${groupId}:${userId}`;
    setMemberUpdating((p) => ({ ...p, [key]: true }));
    const res = await fetch(`/api/admin/groups/${groupId}/members/${userId}`, { method: "DELETE" });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id !== groupId ? g : {
            ...g,
            memberships: g.memberships.filter((m) => m.userId !== userId),
          }
        )
      );
    }
    setMemberUpdating((p) => ({ ...p, [key]: false }));
  };

  // ── Custom prediction handlers ────────────────────────────────────────────────

  const handleCreateCustomPrediction = async () => {
    const cleanOptions = cpForm.options.map((o) => o.trim()).filter(Boolean);
    if (!cpForm.question.trim() || cleanOptions.length < 2 || !cpForm.lockTime || !cpForm.groupId) return;
    setCpCreating(true);
    const res = await fetch("/api/admin/custom-predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: cpForm.question.trim(),
        options: cleanOptions,
        points: cpForm.points,
        lockTime: new Date(cpForm.lockTime).toISOString(),
        groupId: cpForm.groupId,
      }),
    });
    if (res.ok) {
      setCpForm({ question: "", options: ["", ""], points: 3, lockTime: "", groupId: cpForm.groupId });
      setCustomLoaded(false);
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
        prev.map((cp) => cp.id === cpId ? { ...cp, status: "RESOLVED", correctOption } : cp)
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

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (status === "loading" || !session) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }
  if (role !== "ADMIN" && role !== "SUB_ADMIN") return null;

  const filtered = matches.filter((m) => m.round === roundFilter);
  const selectedMatch = matches.find((m) => m.id === selectedMatchId);

  const tabs: { key: Tab; label: string }[] = [
    { key: "results", label: "Match Results" },
    { key: "predictions", label: "Edit Predictions" },
    ...(isAdmin ? [
      { key: "settings" as Tab, label: "Point Defaults" },
      { key: "users" as Tab, label: "Users" },
      { key: "custom" as Tab, label: "Custom Predictions" },
      { key: "groups" as Tab, label: "Groups" },
    ] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        {isAdmin ? "Admin Panel" : "Moderator Panel"}
      </h1>
      <p className="text-gray-400 text-sm mb-6">
        {isAdmin ? "Manage results, predictions, settings and users" : "Update match results and edit user predictions"}
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              activeTab === t.key
                ? "border-fifa-blue text-fifa-blue"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Match Results tab ──────────────────────────────────────────────────── */}
      {activeTab === "results" && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {ROUNDS.map((r) => (
              <button
                key={r}
                onClick={() => setRoundFilter(r)}
                className={`text-sm px-3 py-1.5 rounded-full border transition ${
                  roundFilter === r
                    ? "bg-fifa-blue text-white border-fifa-blue"
                    : "border-gray-300 text-gray-600 hover:border-fifa-blue"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Kickoff</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((match, i) => {
                  const isFinished = match.status === "FINISHED";
                  const input = resultInputs[match.id] ?? { home: "", away: "" };
                  return (
                    <tr key={match.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3 text-gray-400">{match.matchNumber}</td>
                      <td className="px-4 py-3 font-medium">
                        <div>{match.homeTeam} vs {match.awayTeam}</div>
                        <div className="text-xs text-gray-400">{match.city}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(match.kickoff).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                          timeZoneName: "short",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {isFinished ? (
                          <span className="font-bold text-gray-700">
                            {match.homeScore} – {match.awayScore}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min="0" max="20" value={input.home}
                              onChange={(e) =>
                                setResultInputs((prev) => ({ ...prev, [match.id]: { ...prev[match.id], home: e.target.value } }))
                              }
                              className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                              placeholder="0"
                            />
                            <span className="text-gray-400">–</span>
                            <input
                              type="number" min="0" max="20" value={input.away}
                              onChange={(e) =>
                                setResultInputs((prev) => ({ ...prev, [match.id]: { ...prev[match.id], away: e.target.value } }))
                              }
                              className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                              placeholder="0"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${
                          isFinished ? "bg-green-100 text-green-700" :
                          match.status === "LIVE" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {match.status.charAt(0) + match.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isFinished ? (
                          <span className="text-xs text-gray-400 flex items-center gap-1">🔒 Locked</span>
                        ) : (
                          <button
                            onClick={() => handleSaveResult(match.id)}
                            disabled={saving[match.id]}
                            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                          >
                            {saving[match.id] ? "…" : savedMatches.has(match.id) ? "Saved ✓" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Edit Predictions tab ───────────────────────────────────────────────── */}
      {activeTab === "predictions" && (
        <div>
          <div className="card mb-6">
            <h2 className="font-bold text-gray-800 mb-3">Select Group &amp; Match</h2>
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Group</label>
              <select
                value={predGroupId}
                onChange={(e) => { setPredGroupId(e.target.value); setMatchPredictions([]); }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              >
                <option value="">— choose a group —</option>
                {predGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <label className="block text-xs text-gray-500 mb-1">Match</label>
            <select
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
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
            {selectedMatch && (
              <p className="text-xs text-gray-400 mt-2">
                {new Date(selectedMatch.kickoff).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
                })} · {selectedMatch.city} · Status: <span className="font-medium">{selectedMatch.status}</span>
              </p>
            )}
          </div>

          {selectedMatchId && (
            <>
              {selectedMatch && Date.now() >= new Date(selectedMatch.kickoff).getTime() - 60 * 60 * 1000 && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
                  🔒 <strong>Predictions locked.</strong> This match is within 1 hour of kickoff or has finished — no edits allowed.
                </div>
              )}
            <div className="card overflow-hidden p-0">
              {loadingPreds ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading predictions…</div>
              ) : matchPredictions.length === 0 ? (
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
                    {matchPredictions.map((pred, i) => {
                      const isLocked = selectedMatch
                        ? Date.now() >= new Date(selectedMatch.kickoff).getTime() - 60 * 60 * 1000
                        : false;
                      const input = predInputs[pred.userId] ?? { home: String(pred.homeScore), away: String(pred.awayScore) };
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
                                    setPredInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], home: e.target.value } }))
                                  }
                                  className="w-12 border border-gray-300 rounded px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                                />
                                <span className="text-gray-400">–</span>
                                <input
                                  type="number" min="0" max="20" value={input.away}
                                  onChange={(e) =>
                                    setPredInputs((prev) => ({ ...prev, [pred.userId]: { ...prev[pred.userId], away: e.target.value } }))
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
                              <span className="text-xs text-gray-400">🔒 Locked</span>
                            ) : (
                              <button
                                onClick={() => handleSavePrediction(pred.userId)}
                                disabled={savingPred[pred.userId]}
                                className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200"
                              >
                                {savingPred[pred.userId] ? "…" : savedPreds.has(pred.userId) ? "Saved ✓" : "✎ Edit"}
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
          )}
        </div>
      )}

      {/* ── Point Defaults tab (admin only) ─────────────────────────────────────── */}
      {activeTab === "settings" && isAdmin && (
        <>
          <div className="card mb-8">
            <h2 className="font-bold text-gray-800 mb-1">Point Defaults</h2>
            <p className="text-xs text-gray-400 mb-4">
              These are the defaults used when creating a new group. Each group can override them.
            </p>
            <div className="flex flex-wrap gap-6 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Exact Score (pts)</label>
                <input
                  type="number" min="0" value={settings.exactMatchPoints}
                  onChange={(e) => setSettings((s) => ({ ...s, exactMatchPoints: Number(e.target.value) }))}
                  className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Correct Winner/Draw (pts)</label>
                <input
                  type="number" min="0" value={settings.directionMatchPoints}
                  onChange={(e) => setSettings((s) => ({ ...s, directionMatchPoints: Number(e.target.value) }))}
                  className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <button onClick={handleSaveSettings} className="btn-primary">
                {settingsSaved ? "Saved ✓" : "Save Defaults"}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-800">Auto Score Sync</h2>
                <p className="text-xs text-gray-400 mt-1 max-w-md">
                  Fetches finished match scores automatically every 5 minutes (1h 45m after kickoff).
                  Uses <strong>football-data.org</strong> if you set <code className="bg-gray-100 px-1 rounded">FOOTBALL_DATA_API_KEY</code>,
                  otherwise falls back to ESPN&apos;s unofficial API.
                </p>
              </div>
              <button
                onClick={handlePollScores}
                disabled={polling}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                {polling ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Checking…
                  </>
                ) : (
                  "⟳ Sync Scores Now"
                )}
              </button>
            </div>

            {pollResult && (
              <div className={`mt-4 rounded-lg p-3 text-sm ${
                pollResult.updated > 0
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : pollResult.error
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-gray-50 border border-gray-200 text-gray-600"
              }`}>
                {pollResult.updated > 0 ? (
                  <>
                    <p className="font-semibold">✓ Updated {pollResult.updated} match{pollResult.updated > 1 ? "es" : ""} via {pollResult.source}</p>
                    <ul className="mt-1 space-y-0.5">
                      {pollResult.matches.map((m) => (
                        <li key={m.matchNumber}>#{m.matchNumber} {m.home} <strong>{m.score}</strong> {m.away}</li>
                      ))}
                    </ul>
                  </>
                ) : pollResult.error ? (
                  <p>⚠ {pollResult.error} — no scores available yet from any source.</p>
                ) : (
                  <p>
                    Checked {pollResult.checked} pending match{pollResult.checked !== 1 ? "es" : ""} —
                    {pollResult.checked === 0
                      ? " no matches in the polling window (1h 45m–8h after kickoff)."
                      : " no finished scores found yet. Will retry automatically."}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Custom Predictions tab (admin only) ──────────────────────────────── */}
      {activeTab === "custom" && isAdmin && (
        <div className="space-y-6">
          {/* Create form */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-4">Create Custom Prediction</h2>
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
                        onChange={(e) => setCpForm((f) => {
                          const opts = [...f.options];
                          opts[idx] = e.target.value;
                          return { ...f, options: opts };
                        })}
                        placeholder={`Option ${idx + 1}`}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                      />
                      {cpForm.options.length > 2 && (
                        <button
                          onClick={() => setCpForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }))}
                          className="text-red-400 hover:text-red-600 text-sm px-2"
                        >✕</button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setCpForm((f) => ({ ...f, options: [...f.options, ""] }))}
                    className="text-xs text-fifa-blue hover:underline"
                  >+ Add option</button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Group</label>
                <select
                  value={cpForm.groupId}
                  onChange={(e) => setCpForm((f) => ({ ...f, groupId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                >
                  <option value="">— select group —</option>
                  {cpGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points</label>
                  <input
                    type="number" min="1" value={cpForm.points}
                    onChange={(e) => setCpForm((f) => ({ ...f, points: Number(e.target.value) }))}
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
                disabled={cpCreating || !cpForm.groupId}
                className="btn-primary disabled:opacity-50"
              >
                {cpCreating ? "Creating…" : "Create Prediction"}
              </button>
            </div>
          </div>

          {/* List */}
          {!customLoaded ? (
            <div className="card text-center text-gray-400 text-sm py-8">Loading…</div>
          ) : customPredictions.length === 0 ? (
            <div className="card text-center text-gray-400 text-sm py-8">No custom predictions yet.</div>
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
                        <span className={`badge ${
                          cp.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                          isLocked ? "bg-red-100 text-red-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>
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
                          <span key={opt} className={`text-xs px-2 py-1 rounded-full border ${
                            cp.correctOption === opt ? "bg-green-50 border-green-300 text-green-700 font-semibold" : "bg-gray-50 border-gray-200 text-gray-600"
                          }`}>
                            {cp.correctOption === opt && "✓ "}{opt} ({count})
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
                          onChange={(e) => setcpResolving((p) => ({ ...p, [cp.id]: e.target.value }))}
                          className="flex-1 min-w-32 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        >
                          <option value="">— select —</option>
                          {cp.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
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
      )}

      {/* ── Users tab (admin only) ────────────────────────────────────────────── */}
      {activeTab === "users" && isAdmin && (
        <div className="card overflow-hidden p-0">
          {!usersLoaded ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading users…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.image ? (
                          <Image src={user.image} alt="" width={28} height={28} className="rounded-full" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                            {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-gray-800">{user.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${
                        user.role === "ADMIN" ? "bg-purple-100 text-purple-700" :
                        user.role === "SUB_ADMIN" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {user.role === "ADMIN" ? "Admin" : user.role === "SUB_ADMIN" ? "Sub-admin" : "User"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.role !== "ADMIN" && user.id !== session.user.id && (
                        <button
                          onClick={() => handleRoleToggle(user.id, user.role)}
                          disabled={roleUpdating[user.id]}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition disabled:opacity-50 ${
                            user.role === "SUB_ADMIN"
                              ? "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                              : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                          }`}
                        >
                          {roleUpdating[user.id]
                            ? "…"
                            : user.role === "SUB_ADMIN"
                            ? "Remove sub-admin"
                            : "Make sub-admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Groups tab (admin only) ───────────────────────────────────────────── */}
      {activeTab === "groups" && isAdmin && (
        <div className="space-y-6">
          {/* Create form */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-4">Create Group</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Group name</label>
                <input
                  type="text"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Office League"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={groupForm.description}
                  onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short description…"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Avatar URL (optional)</label>
                <input
                  type="url"
                  value={groupForm.avatar}
                  onChange={(e) => setGroupForm((f) => ({ ...f, avatar: e.target.value }))}
                  placeholder="https://…"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div className="flex gap-4 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points: Exact Score</label>
                  <input
                    type="number" min="0"
                    value={groupForm.exactMatchPoints}
                    onChange={(e) => setGroupForm((f) => ({ ...f, exactMatchPoints: Number(e.target.value) }))}
                    className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points: Correct Winner/Draw</label>
                  <input
                    type="number" min="0"
                    value={groupForm.directionMatchPoints}
                    onChange={(e) => setGroupForm((f) => ({ ...f, directionMatchPoints: Number(e.target.value) }))}
                    className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                  />
                </div>
              </div>
              <button
                onClick={handleCreateGroup}
                disabled={groupCreating || !groupForm.name.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {groupCreating ? "Creating…" : "Create Group"}
              </button>
            </div>
          </div>

          {/* Group list */}
          {!groupsLoaded ? (
            <div className="card text-center text-gray-400 text-sm py-8">Loading…</div>
          ) : groups.length === 0 ? (
            <div className="card text-center text-gray-400 text-sm py-8">No groups yet.</div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const approved = group.memberships.filter((m) => m.status === "APPROVED");
                const pending = group.memberships.filter((m) => m.status === "PENDING");
                const rejected = group.memberships.filter((m) => m.status === "REJECTED");
                const isExpanded = expandedGroup === group.id;

                const isEditing = editingGroup === group.id;

                return (
                  <div key={group.id} className="card">
                    {/* Group header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {group.avatar ? (
                          <Image src={group.avatar} alt="" width={36} height={36} className="rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-fifa-blue text-white font-bold flex items-center justify-center text-sm shrink-0">
                            {group.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-800">{group.name}</h3>
                          {group.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{group.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-500">
                              {approved.length} {approved.length === 1 ? "member" : "members"}
                            </span>
                            {pending.length > 0 && (
                              <span className="badge bg-yellow-100 text-yellow-700">
                                {pending.length} pending
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {group.exactMatchPoints}pt exact · {group.directionMatchPoints}pt direction
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            if (isEditing) { setEditingGroup(null); return; }
                            setGroupEditForms((p) => ({ ...p, [group.id]: { name: group.name, description: group.description ?? "", avatar: group.avatar ?? "", exactMatchPoints: group.exactMatchPoints, directionMatchPoints: group.directionMatchPoints } }));
                            setEditingGroup(group.id);
                          }}
                          className="text-xs text-gray-500 hover:text-fifa-blue"
                        >
                          {isEditing ? "Cancel" : "Edit"}
                        </button>
                        <button
                          onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                          className="text-xs text-fifa-blue hover:underline"
                        >
                          {isExpanded ? "Hide" : "Manage"}
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          disabled={groupDeleting[group.id]}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
                        >
                          {groupDeleting[group.id] ? "…" : "Delete"}
                        </button>
                      </div>
                    </div>

                    {/* Inline edit form */}
                    {isEditing && (
                      <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                        <input
                          type="text"
                          value={groupEditForms[group.id]?.name ?? ""}
                          onChange={(e) => setGroupEditForms((p) => ({ ...p, [group.id]: { ...p[group.id], name: e.target.value } }))}
                          placeholder="Group name"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        />
                        <input
                          type="text"
                          value={groupEditForms[group.id]?.description ?? ""}
                          onChange={(e) => setGroupEditForms((p) => ({ ...p, [group.id]: { ...p[group.id], description: e.target.value } }))}
                          placeholder="Description (optional)"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        />
                        <input
                          type="url"
                          value={groupEditForms[group.id]?.avatar ?? ""}
                          onChange={(e) => setGroupEditForms((p) => ({ ...p, [group.id]: { ...p[group.id], avatar: e.target.value } }))}
                          placeholder="Avatar URL (optional)"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                        />
                        <div className="flex gap-4 flex-wrap">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Points: Exact Score</label>
                            <input
                              type="number" min="0"
                              value={groupEditForms[group.id]?.exactMatchPoints ?? 5}
                              onChange={(e) => setGroupEditForms((p) => ({ ...p, [group.id]: { ...p[group.id], exactMatchPoints: Number(e.target.value) } }))}
                              className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Points: Correct Winner/Draw</label>
                            <input
                              type="number" min="0"
                              value={groupEditForms[group.id]?.directionMatchPoints ?? 1}
                              onChange={(e) => setGroupEditForms((p) => ({ ...p, [group.id]: { ...p[group.id], directionMatchPoints: Number(e.target.value) } }))}
                              className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => handleSaveGroupEdit(group.id)}
                          disabled={groupEditSaving[group.id]}
                          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                        >
                          {groupEditSaving[group.id] ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    )}

                    {/* Expanded member management */}
                    {isExpanded && (
                      <div className="mt-4 border-t border-gray-100 pt-4 space-y-4">
                        {/* Add member directly */}
                        <div>
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Add Member</p>
                          <div className="flex gap-2">
                            <select
                              value={addMemberInputs[group.id] ?? ""}
                              onChange={(e) => setAddMemberInputs((p) => ({ ...p, [group.id]: e.target.value }))}
                              className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                            >
                              <option value="">— select user —</option>
                              {users
                                .filter((u) => !group.memberships.some((m) => m.userId === u.id && m.status === "APPROVED"))
                                .map((u) => (
                                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                                ))}
                            </select>
                            <button
                              onClick={() => handleAddMember(group.id)}
                              disabled={addMemberSaving[group.id] || !addMemberInputs[group.id]}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-40 shrink-0"
                            >
                              {addMemberSaving[group.id] ? "…" : "Add"}
                            </button>
                          </div>
                          {addMemberMessages[group.id] && (
                            <p className={`text-xs mt-1 ${addMemberMessages[group.id].ok ? "text-green-600" : "text-red-500"}`}>
                              {addMemberMessages[group.id].text}
                            </p>
                          )}
                        </div>

                        {/* Pending requests */}
                        {pending.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2">
                              Pending Requests ({pending.length})
                            </p>
                            <div className="space-y-2">
                              {pending.map((m) => {
                                const key = `${group.id}:${m.userId}`;
                                return (
                                  <div key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-100">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {m.user.image ? (
                                        <Image src={m.user.image} alt="" width={24} height={24} className="rounded-full shrink-0" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 shrink-0">
                                          {(m.user.name ?? m.user.email ?? "?").charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{m.user.name ?? "—"}</p>
                                        <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        onClick={() => handleMemberStatus(group.id, m.userId, "APPROVED")}
                                        disabled={memberUpdating[key]}
                                        className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-40"
                                      >
                                        {memberUpdating[key] ? "…" : "Approve"}
                                      </button>
                                      <button
                                        onClick={() => handleMemberStatus(group.id, m.userId, "REJECTED")}
                                        disabled={memberUpdating[key]}
                                        className="text-xs px-3 py-1.5 rounded-lg font-semibold border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 disabled:opacity-40"
                                      >
                                        {memberUpdating[key] ? "…" : "Reject"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Approved members */}
                        {approved.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
                              Members ({approved.length})
                            </p>
                            <div className="space-y-2">
                              {approved.map((m) => {
                                const key = `${group.id}:${m.userId}`;
                                return (
                                  <div key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {m.user.image ? (
                                        <Image src={m.user.image} alt="" width={24} height={24} className="rounded-full shrink-0" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 shrink-0">
                                          {(m.user.name ?? m.user.email ?? "?").charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{m.user.name ?? "—"}</p>
                                        <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveMember(group.id, m.userId)}
                                      disabled={memberUpdating[key]}
                                      className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 shrink-0"
                                    >
                                      {memberUpdating[key] ? "…" : "Remove"}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Rejected */}
                        {rejected.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                              Rejected ({rejected.length})
                            </p>
                            <div className="space-y-2">
                              {rejected.map((m) => {
                                const key = `${group.id}:${m.userId}`;
                                return (
                                  <div key={m.userId} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 opacity-60">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {m.user.image ? (
                                        <Image src={m.user.image} alt="" width={24} height={24} className="rounded-full shrink-0" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 shrink-0">
                                          {(m.user.name ?? m.user.email ?? "?").charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <p className="text-sm text-gray-600 truncate">{m.user.name ?? m.user.email ?? "—"}</p>
                                    </div>
                                    <button
                                      onClick={() => handleMemberStatus(group.id, m.userId, "APPROVED")}
                                      disabled={memberUpdating[key]}
                                      className="text-xs text-fifa-blue hover:underline disabled:opacity-40 shrink-0"
                                    >
                                      {memberUpdating[key] ? "…" : "Re-approve"}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {approved.length === 0 && pending.length === 0 && rejected.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-2">No join requests yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
