"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFlag } from "@/lib/flags";
import Image from "next/image";
import Link from "next/link";
import { WC_GROUPS } from "@/lib/wcGroups";
import { AdminSummary } from "@/components/admin/AdminSummary";
import { GROUP_EMOJI_OPTIONS } from "@/lib/groupAvatar";
import { STAGES, type StagePointsMap, defaultStagePoints, loadStagePoints } from "@/lib/stagePoints";

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
  stagePoints: StagePointsMap;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  createdAt: string;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  myStatus: string | null;
}

interface GlobalPrediction {
  id: string;
  question: string;
  optionType: string;
  teamSort: string;
  points: number;
  lockTime: string;
  status: string;
  correctOption: string | null;
  answerCount: number;
}

type Tab = "results" | "settings" | "users" | "groups" | "advancement" | "email";

const ROUNDS = [
  "Group Stage",
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third Place Play-off",
  "Final",
];

// WC_GROUPS is imported from @/lib/wcGroups — single source of truth

const ADVANCEMENT_OPTIONS = [
  { value: "WINNER", label: "Group Winner", color: "text-green-700 border-green-300 bg-green-50" },
  { value: "RUNNER_UP", label: "Runner-up", color: "text-blue-700 border-blue-300 bg-blue-50" },
  { value: "THIRD", label: "Advance as 3rd", color: "text-amber-700 border-amber-300 bg-amber-50" },
  { value: "ELIMINATED", label: "Eliminated", color: "text-red-700 border-red-300 bg-red-50" },
];

function AdminPage() {
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
  const [matchSearch, setMatchSearch] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<"all" | "scheduled" | "needsScoring" | "finished">("all");
  const [groupSearch, setGroupSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  // ── Settings tab state (admin only) ─────────────────────────────────────────
  const [settings, setSettings] = useState<Settings>({ exactMatchPoints: 5, directionMatchPoints: 1, stagePoints: defaultStagePoints() });
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

  // ── Groups tab state ──────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<Record<string, boolean>>({});
  const [globalPreds, setGlobalPreds] = useState<GlobalPrediction[]>([]);
  const [togglingPred, setTogglingPred] = useState<Record<string, boolean>>({});
  const [unresolvingPred, setUnresolvingPred] = useState<Record<string, boolean>>({});
  const [resolveInputs, setResolveInputs] = useState<Record<string, string>>({});
  const [resolvingPred, setResolvingPred] = useState<Record<string, boolean>>({});
  const [resolveResults, setResolveResults] = useState<Record<string, { awarded: number } | { error: string }>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupVisitor, setNewGroupVisitor] = useState(false);
  const [newGroupPublic, setNewGroupPublic] = useState(false);
  const [newGroupAvatar, setNewGroupAvatar] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState("");

  // ── CSV import state ──────────────────────────────────────────────────────────
  const DEFAULT_CSV = `Prediction\tcomment\tLimitation\tpoints
Top Scorer\tIn case of ties, all players are valid\tPlayer\t4
Team to Receive First Red Card\tThis is globally (first red card in the tournament), not the earliest red card in a specific game.\tTeam\t4
Most Points in Group Stage\tIn case of ties on points, all teams are valid\tTeam\t4
Least Goals Scored in Group Stage\tIn case of ties, all teams are valid\tTeam\t4
Most Goals Scored in Group Stage\tIn case of ties, all teams are valid\tTeam\t4
Least Goals Conceded in Group Stage\tIn case of ties, all teams are valid\tTeam\t4
Most Goals Conceded in Group Stage\tIn case of ties, all teams are valid\tTeam\t4
Team to Score Fastest Goal\tBased on official goal minute (not actual clock time). In case of ties, all teams are valid.\tTeam\t4
Finalist 1\t\tTeam\t4
Finalist 2\t\tTeam\t4
Winner\t\tTeam\t10`;
  const [csvText, setCsvText] = useState(DEFAULT_CSV);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; skipped: number; updated?: number } | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  // ── Tab state ────────────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (t === "groups" || t === "settings" || t === "users" || t === "results" || t === "advancement" || t === "email") ? t as Tab : "results";
  });

  // ── Advancement tab state ─────────────────────────────────────────────────────
  const [advancementResolutions, setAdvancementResolutions] = useState<Record<string, string>>({});
  const [advancementLocal, setAdvancementLocal] = useState<Record<string, string>>({});
  const [advancementLoaded, setAdvancementLoaded] = useState(false);
  const [advancementGroupSaving, setAdvancementGroupSaving] = useState<Record<string, boolean>>({});
  const [advancementGroupSaved, setAdvancementGroupSaved] = useState<Record<string, boolean>>({});
  const [advancementGroupErrors, setAdvancementGroupErrors] = useState<Record<string, string>>({});

  // ── Claudio AI state (admin only) ────────────────────────────────────────────
  const [claudioStats, setClaudioStats] = useState<{ predictionCount: number; groupCount: number; lastGenerated: string | null } | null>(null);
  const [claudioGenerating, setClaudioGenerating] = useState(false);
  const [claudioResult, setClaudioResult] = useState<{ generated: number; matchCount: number; groupCount: number; message?: string } | { error: string } | null>(null);

  // ── Platform invite state (admin only) ───────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  // ── Email preview state (admin only) ─────────────────────────────────────────
  const [previewTemplate, setPreviewTemplate] = useState("invite");
  const [previewSending, setPreviewSending] = useState(false);
  const [previewSent, setPreviewSent] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [isDev, setIsDev] = useState(false);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "loading") return;
    if (!session || (role !== "ADMIN" && role !== "GROUP_ADMIN")) {
      router.replace("/");
    }
  }, [session, status, router, role]);

  // ── Initial data load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || (role !== "ADMIN" && role !== "GROUP_ADMIN")) return;

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
        const sData: { exactMatchPoints: number; directionMatchPoints: number; stagePoints?: string } = await sRes.json();
        if (sData) {
          setSettings({
            exactMatchPoints: sData.exactMatchPoints,
            directionMatchPoints: sData.directionMatchPoints,
            stagePoints: loadStagePoints(sData.stagePoints),
          });
        }

        // Load dev/prod flag for banner
        fetch("/api/admin/config")
          .then((r) => r.json())
          .then((d) => { if (d.isDev !== undefined) setIsDev(d.isDev); })
          .catch(() => {});
      }
    }
    load();
  }, [session, role]);

  // ── Load Claudio stats when Settings tab opens ───────────────────────────────
  useEffect(() => {
    if (activeTab !== "settings" || !isAdmin || claudioStats !== null) return;
    fetch("/api/admin/claudio")
      .then((r) => r.json())
      .then((d) => setClaudioStats(d))
      .catch(() => {});
  }, [activeTab, isAdmin, claudioStats]);

  // ── Load users when Users tab is first opened ────────────────────────────────
  useEffect(() => {
    if (activeTab !== "users" || usersLoaded || !isAdmin) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: UserRow[]) => { setUsers(data); setUsersLoaded(true); });
  }, [activeTab, usersLoaded, isAdmin]);

  // ── Load groups + global predictions when Groups tab is opened ───────────────
  useEffect(() => {
    if (activeTab !== "groups" || groupsLoaded) return;
    Promise.all([
      fetch("/api/groups").then((r) => r.json()),
      fetch("/api/admin/custom-predictions").then((r) => r.json()),
    ]).then(([groupData, predData]) => {
      if (Array.isArray(groupData)) setGroups(groupData);
      if (Array.isArray(predData)) {
        setGlobalPreds(predData);
        const inputs: Record<string, string> = {};
        predData.forEach((p: GlobalPrediction) => {
          if (p.correctOption) inputs[p.id] = p.correctOption;
        });
        setResolveInputs(inputs);
      }
      setGroupsLoaded(true);
    });
  }, [activeTab, groupsLoaded]);

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
      body: JSON.stringify({
        exactMatchPoints: settings.exactMatchPoints,
        directionMatchPoints: settings.directionMatchPoints,
        stagePoints: JSON.stringify(settings.stagePoints),
      }),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleGenerateClaudio = async () => {
    setClaudioGenerating(true);
    setClaudioResult(null);
    try {
      const res = await fetch("/api/admin/claudio", { method: "POST" });
      const data = await res.json();
      setClaudioResult(data);
      if (res.ok) setClaudioStats(null); // trigger stats reload
    } finally {
      setClaudioGenerating(false);
    }
  };

  const handleEmailPreviewInTab = async () => {
    const res = await fetch(`/api/admin/email-preview?template=${previewTemplate}`);
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  };

  const handleSendTestEmail = async () => {
    setPreviewSending(true);
    setPreviewSent(false);
    setPreviewError("");
    try {
      const res = await fetch(`/api/admin/email-preview?template=${previewTemplate}&send=true`);
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? `HTTP ${res.status}`);
      } else {
        setPreviewSent(true);
        setTimeout(() => setPreviewSent(false), 3000);
      }
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewSending(false);
    }
  };

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "GROUP_ADMIN" ? "USER" : "GROUP_ADMIN";
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

  // ── Load advancement resolutions when tab opens ──────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab !== "advancement" || advancementLoaded) return;
    fetch("/api/admin/advancement")
      .then((r) => r.json())
      .then((data: { team: string; result: string }[]) => {
        const map: Record<string, string> = {};
        for (const r of data) map[r.team] = r.result;
        setAdvancementResolutions(map);
        setAdvancementLocal(map); // initialise local to DB state
        setAdvancementLoaded(true);
      });
  }, [activeTab, advancementLoaded]);

  // ── Render guards ─────────────────────────────────────────────────────────────
  if (status === "loading" || !session) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  }
  if (role !== "ADMIN" && role !== "GROUP_ADMIN") return null;

  const matchSearchLower = matchSearch.trim().toLowerCase();
  const nowMsReal = Date.now();
  const twoHoursAgoMs = nowMsReal - 2 * 60 * 60 * 1000;
  const filtered = matches.filter((m) => {
    if (m.round !== roundFilter) return false;
    if (matchStatusFilter === "scheduled" && m.status !== "SCHEDULED") return false;
    if (matchStatusFilter === "finished" && m.status !== "FINISHED") return false;
    if (matchStatusFilter === "needsScoring") {
      if (m.status !== "SCHEDULED") return false;
      if (new Date(m.kickoff).getTime() > twoHoursAgoMs) return false;
    }
    if (matchSearchLower) {
      const hay = `${m.homeTeam} ${m.awayTeam} ${m.city}`.toLowerCase();
      if (!hay.includes(matchSearchLower)) return false;
    }
    return true;
  });
  const totalInRound = matches.filter((m) => m.round === roundFilter).length;

  const parseCsvPredictions = (text: string) => {
    const lines = text.trim().split("\n").slice(1); // skip header
    return lines.map((line) => {
      const parts = line.split("\t");
      const limitation = parts[2]?.trim() ?? "";
      return {
        question: parts[0]?.trim() ?? "",
        description: parts[1]?.trim() || null,
        optionType: limitation === "Player" ? "PLAYER" : limitation === "Team" ? "TEAM" : "FIXED",
        points: parseInt(parts[3]?.trim() ?? "3", 10) || 3,
      };
    }).filter((p) => p.question);
  };

  const handleCsvImport = async () => {
    const predictions = parseCsvPredictions(csvText);
    if (predictions.length === 0) return;
    setCsvImporting(true);
    setCsvResult(null);
    const res = await fetch("/api/admin/custom-predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: true, isGlobal: true, predictions, skipExisting: true }),
    });
    const data = await res.json();
    setCsvResult({ created: data.created ?? 0, skipped: data.skipped ?? 0 });
    setCsvImporting(false);
    if ((data.created ?? 0) > 0) {
      setGroupsLoaded(false); // trigger reload of global preds
    }
  };

  const handleLoadDefaults = async () => {
    setLoadingDefaults(true);
    setCsvResult(null);
    const res = await fetch("/api/admin/custom-predictions/defaults", { method: "POST" });
    const data = await res.json();
    setCsvResult({ created: data.created ?? 0, skipped: 0, updated: data.updated ?? 0 });
    setLoadingDefaults(false);
    if ((data.created ?? 0) > 0) {
      setGroupsLoaded(false); // trigger reload
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}" and all its data? This cannot be undone.`)) return;
    setDeletingGroup((p) => ({ ...p, [id]: true }));
    const res = await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
    if (res.ok) setGroups((prev) => prev.filter((g) => g.id !== id));
    setDeletingGroup((p) => ({ ...p, [id]: false }));
  };

  const handleToggleGlobalPred = async (pred: GlobalPrediction) => {
    const action = pred.status === "DISABLED" ? "enable" : "disable";
    setTogglingPred((p) => ({ ...p, [pred.id]: true }));
    const res = await fetch(`/api/admin/custom-predictions/${pred.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setGlobalPreds((prev) => prev.map((p) =>
        p.id === pred.id ? { ...p, status: action === "enable" ? "OPEN" : "DISABLED" } : p
      ));
    }
    setTogglingPred((p) => ({ ...p, [pred.id]: false }));
  };

  const handleUnresolvePred = async (id: string) => {
    if (!confirm("Un-resolve this prediction? All awarded points will be cleared.")) return;
    setUnresolvingPred((p) => ({ ...p, [id]: true }));
    const res = await fetch(`/api/admin/custom-predictions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unresolve" }),
    });
    if (res.ok) {
      setGlobalPreds((prev) => prev.map((p) =>
        p.id === id ? { ...p, status: "OPEN", correctOption: null } : p
      ));
      setResolveResults((r) => { const n = { ...r }; delete n[id]; return n; });
    }
    setUnresolvingPred((p) => ({ ...p, [id]: false }));
  };

  const handleResolvePred = async (id: string) => {
    const correctOption = resolveInputs[id]?.trim();
    if (!correctOption) return;
    setResolvingPred((p) => ({ ...p, [id]: true }));
    setResolveResults((p) => { const n = { ...p }; delete n[id]; return n; });
    const res = await fetch(`/api/admin/custom-predictions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", correctOption }),
    });
    const data = await res.json();
    setResolvingPred((p) => ({ ...p, [id]: false }));
    if (res.ok) {
      setResolveResults((p) => ({ ...p, [id]: { awarded: data.awarded } }));
      setGlobalPreds((prev) => prev.map((p) => p.id === id ? { ...p, status: "RESOLVED" } : p));
    } else {
      setResolveResults((p) => ({ ...p, [id]: { error: data.error ?? "Failed" } }));
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    setCreateGroupError("");
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName, description: newGroupDesc, avatar: newGroupAvatar, joinAsVisitor: newGroupVisitor, isPublic: newGroupPublic }),
      });
      if (res.ok) {
        const g = await res.json();
        setGroups((prev) => [...prev, { ...g, memberCount: 1, myStatus: "APPROVED" }]);
        setNewGroupName("");
        setNewGroupDesc("");
        setNewGroupAvatar(null);
        setNewGroupVisitor(false);
        setNewGroupPublic(false);
        window.dispatchEvent(new Event("wc2026:groups-updated"));
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateGroupError(data?.error ?? `Failed to create group (${res.status})`);
      }
    } catch (err) {
      setCreateGroupError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setCreatingGroup(false);
    }
  };

  // Toggle local (no API call yet)
  const handleAdvancementToggle = (team: string, result: string) => {
    setAdvancementLocal((prev) => {
      const next = { ...prev };
      if (prev[team] === result) { delete next[team]; } // click same = deselect
      else { next[team] = result; }
      return next;
    });
  };

  // Save one WC group to the DB.
  //
  // Each team is its own API call (the advancement endpoint is per-team), so
  // a network blip mid-loop can leave a partial save. We don't abort on the
  // first failure — instead we attempt every team and report a precise count
  // ("saved 2 of 4 teams; 2 failed: Brazil, France") so the admin knows what
  // they need to retry rather than silently believing the group was saved.
  const handleSaveAdvancementGroup = async (wcGroup: string) => {
    const teams = WC_GROUPS[wcGroup];
    setAdvancementGroupSaving((s) => ({ ...s, [wcGroup]: true }));
    setAdvancementGroupErrors((e) => ({ ...e, [wcGroup]: "" }));
    const failures: { team: string; error: string }[] = [];
    let attempted = 0;
    try {
      for (const team of teams) {
        const local = advancementLocal[team] ?? null;
        const saved = advancementResolutions[team] ?? null;
        if (local === saved) continue;
        attempted++;
        try {
          if (local === null) {
            const res = await fetch(`/api/admin/advancement?team=${encodeURIComponent(team)}`, { method: "DELETE" });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
            setAdvancementResolutions((r) => { const n = { ...r }; delete n[team]; return n; });
          } else {
            const res = await fetch("/api/admin/advancement", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ team, result: local }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
            setAdvancementResolutions((r) => ({ ...r, [team]: local }));
          }
        } catch (innerErr: unknown) {
          failures.push({ team, error: (innerErr as Error).message ?? "Failed" });
        }
      }
      if (failures.length === 0) {
        setAdvancementGroupSaved((s) => ({ ...s, [wcGroup]: true }));
        setTimeout(() => setAdvancementGroupSaved((s) => ({ ...s, [wcGroup]: false })), 2500);
      } else {
        const succeeded = attempted - failures.length;
        setAdvancementGroupErrors((e) => ({
          ...e,
          [wcGroup]:
            `Saved ${succeeded} of ${attempted} team${attempted === 1 ? "" : "s"}. ` +
            `Failed: ${failures.map((f) => f.team).join(", ")}.`,
        }));
      }
    } finally {
      setAdvancementGroupSaving((s) => ({ ...s, [wcGroup]: false }));
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "results", label: "Match Results" },
    { key: "groups", label: "Groups" },
    { key: "advancement", label: "Advancement" },
    ...(isAdmin ? [
      { key: "settings" as Tab, label: "Point Defaults" },
      { key: "email" as Tab, label: "Email" },
      { key: "users" as Tab, label: "Group Admins" },
    ] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "Admin Panel" : "Moderator Panel"}
        </h1>
        {isAdmin && (
          <Link
            href="/admin/simulation"
            className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-medium transition"
          >
            Simulation Mode →
          </Link>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-6">
        {isAdmin ? "Manage match results, global point defaults and user roles" : "Update match results"}
      </p>

      {/* Action summary — "what should I look at now?" */}
      <AdminSummary
        matches={matches}
        onGo={({ tab, roundFilter }) => {
          if (tab) setActiveTab(tab);
          if (roundFilter) setRoundFilter(roundFilter);
        }}
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-gray-200 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap shrink-0 ${
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
          <div className="mb-3 flex flex-wrap gap-2">
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={matchSearch}
              onChange={(e) => setMatchSearch(e.target.value)}
              placeholder="Search team or city…"
              className="flex-1 min-w-[180px] sm:max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
              aria-label="Filter matches by team or city"
            />
            <div className="flex rounded-lg border border-gray-300 text-xs overflow-hidden" role="group" aria-label="Filter by status">
              {([
                { key: "all", label: "All" },
                { key: "needsScoring", label: "Needs score" },
                { key: "scheduled", label: "Scheduled" },
                { key: "finished", label: "Finished" },
              ] as const).map((f, i) => (
                <button
                  key={f.key}
                  onClick={() => setMatchStatusFilter(f.key)}
                  className={`px-3 py-1.5 transition ${i > 0 ? "border-l border-gray-300" : ""} ${
                    matchStatusFilter === f.key ? "bg-fifa-blue text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400 ml-auto">
              {filtered.length === totalInRound
                ? `${totalInRound} match${totalInRound === 1 ? "" : "es"} in ${roundFilter}`
                : `${filtered.length} of ${totalInRound} match${totalInRound === 1 ? "" : "es"} in ${roundFilter}`}
            </span>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
            <table className="min-w-[680px] w-full text-sm">
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
                  const isKnockoutEditable = match.round !== "Group Stage" && !isFinished;
                  return (
                    <tr key={match.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3 text-gray-400">{match.matchNumber}</td>
                      <td className="px-4 py-3 font-medium">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">{getFlag(match.homeTeam)} <span>{match.homeTeam}</span></div>
                          <div className="text-[10px] text-gray-300 font-normal pl-0.5">vs</div>
                          <div className="flex items-center gap-1.5">{getFlag(match.awayTeam)} <span>{match.awayTeam}</span></div>
                          {isKnockoutEditable && (
                            <button
                              onClick={async () => {
                                const nh = window.prompt(`Home team for match ${match.matchNumber}:`, match.homeTeam);
                                if (nh === null) return;
                                const na = window.prompt(`Away team for match ${match.matchNumber}:`, match.awayTeam);
                                if (na === null) return;
                                if (nh === match.homeTeam && na === match.awayTeam) return;

                                // Step 1 — dry run to count predictions that would be wiped.
                                const dry = await fetch(`/api/admin/matches/${match.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ homeTeam: nh, awayTeam: na, dryRun: true }),
                                });
                                if (!dry.ok) {
                                  const err = await dry.json().catch(() => ({}));
                                  alert(`Failed: ${(err as { error?: string }).error ?? dry.statusText}`);
                                  return;
                                }
                                const dr = await dry.json() as { wouldWipe: number; affectedGroups: number };

                                // Step 2 — explicit confirmation when predictions exist.
                                if (dr.wouldWipe > 0) {
                                  const expected = `${nh} vs ${na}`;
                                  const typed = window.prompt(
                                    `This will DELETE ${dr.wouldWipe} prediction${dr.wouldWipe === 1 ? "" : "s"} ` +
                                    `across ${dr.affectedGroups} group${dr.affectedGroups === 1 ? "" : "s"}. ` +
                                    `\n\nType the new matchup exactly to confirm:\n${expected}`
                                  );
                                  if (typed === null) return;
                                  if (typed.trim() !== expected) {
                                    alert("Confirmation text didn't match. Aborted — no changes made.");
                                    return;
                                  }
                                }

                                // Step 3 — commit.
                                const willWipe = await fetch(`/api/admin/matches/${match.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ homeTeam: nh, awayTeam: na }),
                                });
                                if (!willWipe.ok) {
                                  const err = await willWipe.json().catch(() => ({}));
                                  alert(`Failed: ${(err as { error?: string }).error ?? willWipe.statusText}`);
                                  return;
                                }
                                const r = await willWipe.json();
                                if (r.predictionsWiped > 0) {
                                  alert(`Teams updated. ${r.predictionsWiped} prediction${r.predictionsWiped === 1 ? " was" : "s were"} wiped.`);
                                }
                                window.location.reload();
                              }}
                              className="ml-2 text-[11px] text-blue-600 hover:text-blue-800 underline"
                              title="Edit knockout-match teams (wipes any existing predictions for this match)"
                            >
                              edit teams
                            </button>
                          )}
                        </div>
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
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">
                No matches in {roundFilter} match your filters.
                {matchSearch || matchStatusFilter !== "all" ? (
                  <button
                    onClick={() => { setMatchSearch(""); setMatchStatusFilter("all"); }}
                    className="ml-2 text-fifa-blue hover:underline"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Point Defaults tab (admin only) ─────────────────────────────────────── */}
      {activeTab === "settings" && isAdmin && (
        <>
          <div className="card mb-8">
            <h2 className="font-bold text-gray-800 mb-1">Point Defaults <span className="text-xs font-normal text-gray-400 ml-2">Global</span></h2>
            <p className="text-sm text-gray-500 mb-1">
              These are the <strong>app-wide defaults</strong> seeded into new groups at creation time. Not group-specific.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Changing values here only affects <strong>future</strong> groups. To re-apply these to an existing group, open that group&apos;s Manage page → <em>Group Settings</em> → <em>Reset to global defaults</em>.
            </p>
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-1.5 font-semibold">Stage</th>
                    <th className="px-4 py-1.5 font-semibold w-32">Right pick</th>
                    <th className="px-4 py-1.5 font-semibold w-32">Exact score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {STAGES.map((stage) => {
                    const val = settings.stagePoints[stage];
                    return (
                      <tr key={stage}>
                        <td className="px-4 py-2 text-gray-700">{stage}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number" min="0" value={val.direction}
                            onChange={(e) => setSettings((s) => ({
                              ...s,
                              stagePoints: { ...s.stagePoints, [stage]: { ...s.stagePoints[stage], direction: Number(e.target.value) } },
                            }))}
                            className="w-20 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number" min="0" value={val.exact}
                            onChange={(e) => setSettings((s) => ({
                              ...s,
                              stagePoints: { ...s.stagePoints, [stage]: { ...s.stagePoints[stage], exact: Number(e.target.value) } },
                            }))}
                            className="w-20 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleSaveSettings} className="btn-primary">
                {settingsSaved ? "Saved ✓" : "Save Defaults"}
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, stagePoints: defaultStagePoints() }))}
                className="text-xs text-gray-400 hover:text-fifa-blue"
              >
                Reset to suggested
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
          {/* Claudio AI Bot card */}
          <div className="card mt-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-bold text-gray-800">🧠 Claudio AI Bot</h2>
                <p className="text-xs text-gray-400 mt-1 max-w-md">
                  Claudio is a global bot player that participates in every group. Use AI to generate his predictions for all upcoming matches across all groups.
                  {claudioStats && (
                    <span className="ml-1">
                      Currently in <strong>{claudioStats.groupCount}</strong> group{claudioStats.groupCount !== 1 ? "s" : ""} with <strong>{claudioStats.predictionCount}</strong> predictions.
                      {claudioStats.lastGenerated && (
                        <span className="ml-1 text-gray-300">
                          Last generated: {new Date(claudioStats.lastGenerated).toLocaleString()}
                        </span>
                      )}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={handleGenerateClaudio}
                disabled={claudioGenerating}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                {claudioGenerating ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  "✨ Generate Predictions"
                )}
              </button>
            </div>
            {claudioResult && (
              <div className={`mt-4 rounded-lg p-3 text-sm ${
                "error" in claudioResult
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : "bg-green-50 border border-green-200 text-green-800"
              }`}>
                {"error" in claudioResult ? (
                  <p>⚠ {claudioResult.error}</p>
                ) : claudioResult.message ? (
                  <p>{claudioResult.message}</p>
                ) : (
                  <p className="font-semibold">
                    ✓ Generated predictions for {claudioResult.matchCount} match{claudioResult.matchCount !== 1 ? "es" : ""} across {claudioResult.groupCount} group{claudioResult.groupCount !== 1 ? "s" : ""} ({claudioResult.generated} total records)
                  </p>
                )}
              </div>
            )}
          </div>

        </>
      )}

      {/* ── Email tab (admin only) ────────────────────────────────────────────── */}
      {activeTab === "email" && isAdmin && (
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-1">Email Preview</h2>
          <p className="text-xs text-gray-400 mb-4">
            Preview or test-send any transactional email template. &quot;Send to me&quot; delivers to your admin email address.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={previewTemplate}
              onChange={(e) => { setPreviewTemplate(e.target.value); setPreviewSent(false); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            >
              {[
                { value: "invite", label: "Group invite" },
                { value: "welcome", label: "Welcome (post-join)" },
                { value: "magic", label: "Magic link sign-in" },
                { value: "reset", label: "Password reset" },
                { value: "verification", label: "Join-link verification" },
                { value: "reminder", label: "1-hour lock reminder" },
                { value: "lock30m", label: "30-min lock warning" },
                { value: "postgame", label: "Post-game result" },
                { value: "subadmin", label: "Group Admin action alert" },
              ].map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button onClick={handleEmailPreviewInTab} className="btn-secondary text-sm">
              Preview in tab
            </button>
            <button
              onClick={handleSendTestEmail}
              disabled={previewSending}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {previewSending ? "Sending…" : previewSent ? "Sent ✓" : "Send to me"}
            </button>
          </div>
          {previewError && (
            <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-all">
              <strong>Send failed:</strong> {previewError}
            </p>
          )}
          {isDev && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              🛠 <strong>Dev mode:</strong> "Send to me" will attempt SMTP delivery. Magic link emails in this environment are logged to the server console only.
            </p>
          )}
        </div>
      )}

      {/* ── Groups tab ───────────────────────────────────────────────────────── */}
      {activeTab === "groups" && (() => {
        const allGroupsCard = (
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
              <h2 className="font-bold text-gray-800 text-sm">All Groups ({groups.length})</h2>
              <input
                type="search"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Search…"
                className="ml-auto w-full sm:max-w-xs border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                aria-label="Search groups by name"
              />
            </div>
            {groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">No groups yet.</p>
            ) : (() => {
              const q = groupSearch.trim().toLowerCase();
              const filteredGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q)) : groups;
              if (filteredGroups.length === 0) {
                return (
                  <p className="px-4 py-8 text-center text-gray-400 text-sm">
                    No groups match "{groupSearch}".
                    <button onClick={() => setGroupSearch("")} className="ml-2 text-fifa-blue hover:underline">Clear</button>
                  </p>
                );
              }
              return (
              <div className="overflow-x-auto">
              <table className="min-w-[500px] w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-left border-b border-gray-200 bg-white">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Created by</th>
                    <th className="px-4 py-2">Members</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((g, i) => (
                    <tr key={g.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-gray-800">{g.name}</p>
                          {!g.isPublic && <span className="badge bg-gray-100 text-gray-500 text-[10px]">🔒 Private</span>}
                          {!g.myStatus && <span className="badge bg-amber-50 text-amber-600 text-[10px]">Not member</span>}
                        </div>
                        {g.description && <p className="text-xs text-gray-400">{g.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{(g as {createdByName?: string}).createdByName ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{g.memberCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link href={`/groups/${g.id}`} className="text-xs text-gray-400 hover:text-gray-700">View</Link>
                          <Link href={`/admin/groups/${g.id}`} className="text-xs font-semibold text-fifa-blue hover:underline">Manage →</Link>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteGroup(g.id, g.name)}
                              disabled={deletingGroup[g.id]}
                              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 ml-auto"
                            >
                              {deletingGroup[g.id] ? "…" : "Delete"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              );
            })()}
          </div>
        );

        const createGroupCard = (
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-4">Create New Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Group Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Office League 2026"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="A short description"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Avatar (optional)</label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_EMOJI_OPTIONS.map((emoji) => {
                    const selected = newGroupAvatar === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewGroupAvatar(selected ? null : emoji)}
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
                      const selected = newGroupAvatar === flag;
                      return (
                        <button
                          key={team}
                          type="button"
                          onClick={() => setNewGroupAvatar(selected ? null : flag)}
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
                {newGroupAvatar && (
                  <p className="text-[10px] text-gray-400 mt-1">Tap again to clear.</p>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={newGroupVisitor}
                  onChange={(e) => setNewGroupVisitor(e.target.checked)}
                  className="rounded border-gray-300 text-fifa-blue focus:ring-fifa-blue"
                />
                Join as Visitor Admin (manage only — no predictions or leaderboard)
              </label>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Visibility</label>
                <div className="relative group inline-flex">
                  <div className="flex rounded-lg border border-gray-300 text-sm overflow-hidden">
                    <button type="button" onClick={() => setNewGroupPublic(false)}
                      className={`px-3 py-2 flex items-center gap-1.5 transition ${!newGroupPublic ? "bg-gray-800 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                      🔒 Private
                    </button>
                    <button type="button" onClick={() => setNewGroupPublic(true)}
                      className={`px-3 py-2 flex items-center gap-1.5 transition border-l border-gray-300 ${newGroupPublic ? "bg-fifa-blue text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                      🌐 Public
                    </button>
                  </div>
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden group-hover:flex z-10 gap-3 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap">
                    <span><strong className="text-white">🔒 Private</strong> — Join link / email invite only.</span>
                    <span className="text-gray-600">|</span>
                    <span><strong className="text-white">🌐 Public</strong> — Discoverable on the Groups search page.</span>
                  </div>
                </div>
              </div>
              <button type="submit" disabled={creatingGroup} className="btn-primary disabled:opacity-50">
                {creatingGroup ? "Creating…" : "Create Group"}
              </button>
              {createGroupError && (
                <p className="text-xs text-red-500 mt-1">{createGroupError}</p>
              )}
            </form>
          </div>
        );

        return (
          <div className="space-y-6">
            {groupsLoaded && groups.length > 0 ? (
              <>{allGroupsCard}{createGroupCard}</>
            ) : (
              <>{createGroupCard}{allGroupsCard}</>
            )}

          {/* Global predictions */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800 text-sm">Global Custom Predictions ({globalPreds.length})</h2>
                <p className="text-xs text-gray-400 mt-0.5">Shown in every group automatically.</p>
              </div>
              <button
                onClick={handleLoadDefaults}
                disabled={loadingDefaults}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:border-fifa-blue hover:text-fifa-blue transition disabled:opacity-50"
              >
                {loadingDefaults ? "Loading…" : "Load Defaults"}
              </button>
            </div>
            {globalPreds.length === 0 ? (
              <p className="px-4 py-6 text-center text-gray-400 text-sm">No global predictions yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-left border-b border-gray-200 bg-white">
                    <th className="px-4 py-2">Question</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Pts</th>
                    <th className="px-4 py-2">Answers</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 min-w-[260px]">Resolve (comma-separated valid answers)</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {globalPreds.map((pred, i) => {
                    const result = resolveResults[pred.id];
                    return (
                      <tr key={pred.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                        <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                          <p className="truncate">{pred.question}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          <div className="flex flex-col gap-1">
                            <span>{pred.optionType === "TEAM" ? "⚽ Team" : pred.optionType === "PLAYER" ? "🧑 Player" : "Custom"}</span>
                            {pred.optionType === "TEAM" && (
                              <select
                                value={pred.teamSort ?? "ALPHABETICAL"}
                                onChange={async (e) => {
                                  const val = e.target.value;
                                  setGlobalPreds((prev) => prev.map((p) => p.id === pred.id ? { ...p, teamSort: val } : p));
                                  await fetch(`/api/admin/custom-predictions/${pred.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ teamSort: val }),
                                  });
                                }}
                                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-fifa-blue"
                              >
                                <option value="ALPHABETICAL">A–Z</option>
                                <option value="BY_GROUP">By Group</option>
                                <option value="BY_GAME_ORDER">By Game Order</option>
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{pred.points}</td>
                        <td className="px-4 py-3 text-gray-500">{pred.answerCount}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${
                            pred.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                            pred.status === "DISABLED" ? "bg-gray-100 text-gray-400" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {pred.status === "RESOLVED" ? "Resolved" : pred.status === "DISABLED" ? "Disabled" : "Open"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {pred.status !== "DISABLED" && (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={resolveInputs[pred.id] ?? ""}
                                onChange={(e) => setResolveInputs((p) => ({ ...p, [pred.id]: e.target.value }))}
                                placeholder={pred.status === "RESOLVED" ? "Re-resolve…" : "e.g. France, Argentina"}
                                className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                              />
                              <button
                                onClick={() => handleResolvePred(pred.id)}
                                disabled={resolvingPred[pred.id] || !resolveInputs[pred.id]?.trim()}
                                className="btn-primary text-xs px-2 py-1 whitespace-nowrap disabled:opacity-40"
                              >
                                {resolvingPred[pred.id] ? "…" : "Resolve"}
                              </button>
                            </div>
                          )}
                          {result && (
                            <p className={`text-xs mt-1 ${
                              "error" in result ? "text-red-500" : "text-green-600"
                            }`}>
                              {"error" in result ? `⚠ ${result.error}` : `✓ Awarded to ${result.awarded} player${result.awarded !== 1 ? "s" : ""}`}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleToggleGlobalPred(pred)}
                              disabled={togglingPred[pred.id]}
                              className={`text-xs disabled:opacity-40 ${
                                pred.status === "DISABLED"
                                  ? "text-green-600 hover:text-green-800"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              {togglingPred[pred.id] ? "…" : pred.status === "DISABLED" ? "Enable" : "Disable"}
                            </button>
                            {pred.status === "RESOLVED" && (
                              <button
                                onClick={() => handleUnresolvePred(pred.id)}
                                disabled={unresolvingPred[pred.id]}
                                className="text-xs text-orange-400 hover:text-orange-600 disabled:opacity-40"
                              >
                                {unresolvingPred[pred.id] ? "…" : "Un-resolve"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* CSV bulk import — collapsed by default to keep the Groups tab readable */}
          <details className="card p-0">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2 hover:bg-gray-50">
              <span className="text-sm font-bold text-gray-800">Bulk Import via CSV</span>
              <span className="text-xs text-gray-400">— tab-separated global custom predictions</span>
              <span className="ml-auto text-xs text-gray-400" aria-hidden="true">expand</span>
            </summary>
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">
                Tab-separated: <code className="bg-gray-100 px-1 rounded">Prediction{"\t"}comment{"\t"}Limitation{"\t"}points</code>
                {" "}· Limitation: Player, Team, or leave blank for fixed options.
                Existing questions are skipped.
              </p>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={10}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-fifa-blue resize-y"
              />
              {csvResult && (
                <p className={`text-xs font-medium ${csvResult.created > 0 || (csvResult.updated ?? 0) > 0 ? "text-green-600" : "text-gray-500"}`}>
                  {csvResult.created > 0 ? `✓ Added ${csvResult.created} prediction${csvResult.created !== 1 ? "s" : ""}` : "No new predictions added"}
                  {(csvResult.updated ?? 0) > 0 ? ` · ${csvResult.updated} updated (sort fixed)` : ""}
                  {csvResult.skipped > 0 ? ` · ${csvResult.skipped} skipped (already exist)` : ""}
                </p>
              )}
              <button
                onClick={handleCsvImport}
                disabled={csvImporting || !csvText.trim()}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {csvImporting ? "Importing…" : "Import CSV"}
              </button>
            </div>
          </details>

          </div>
        );
      })()}

      {/* ── Users tab (admin only) ────────────────────────────────────────────── */}
      {/* ── Advancement tab ────────────────────────────────────────────────────── */}
      {activeTab === "advancement" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500">
              Set each team&apos;s actual group stage result to award points to users&apos; advancement picks.
              Select results then click <strong>Save Group</strong> to commit.
            </p>
            {advancementLoaded && (() => {
              const resolvedCount = Object.keys(advancementResolutions).length;
              const total = 48;
              const pct = Math.round((resolvedCount / total) * 100);
              return (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium shrink-0 ${
                  resolvedCount === total
                    ? "bg-green-50 border-green-200 text-green-700"
                    : resolvedCount === 0
                    ? "bg-gray-50 border-gray-200 text-gray-500"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                }`}>
                  <span>{resolvedCount === total ? "✓" : "📋"}</span>
                  <span>{resolvedCount}/{total} teams resolved</span>
                  {resolvedCount > 0 && resolvedCount < total && (
                    <span className="text-xs opacity-70">({pct}%)</span>
                  )}
                </div>
              );
            })()}
          </div>
          {!advancementLoaded ? (
            <div className="text-center text-gray-400 py-8 text-sm">Loading…</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {Object.entries(WC_GROUPS).sort(([a], [b]) => a.localeCompare(b)).map(([wcGroup, teams]) => {
                const groupDirty = teams.some(
                  (t) => (advancementLocal[t] ?? null) !== (advancementResolutions[t] ?? null)
                );
                const isSaving = advancementGroupSaving[wcGroup];
                const isSaved = advancementGroupSaved[wcGroup];
                const groupError = advancementGroupErrors[wcGroup];
                return (
                  <div key={wcGroup} className="card p-0 overflow-hidden">
                    <div className="bg-fifa-blue text-white text-xs font-bold px-3 py-1.5 flex items-center justify-between">
                      <span>Group {wcGroup}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {teams.map((team) => {
                        const localResult = advancementLocal[team];
                        const savedResult = advancementResolutions[team];
                        const changed = (localResult ?? null) !== (savedResult ?? null);
                        return (
                          <div key={team} className={`px-3 py-2 ${changed ? "bg-amber-50" : ""}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-medium text-sm text-gray-800 flex-1">{team}</span>
                              {changed && <span className="text-[10px] text-amber-600 font-medium">unsaved</span>}
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {ADVANCEMENT_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => handleAdvancementToggle(team, opt.value)}
                                  disabled={isSaving}
                                  className={`text-[10px] font-semibold px-2 py-1 rounded border transition disabled:opacity-50 ${
                                    localResult === opt.value
                                      ? opt.color + " font-bold"
                                      : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Per-group save footer */}
                    <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-2">
                      <button
                        onClick={() => handleSaveAdvancementGroup(wcGroup)}
                        disabled={isSaving || !groupDirty}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition ${
                          groupDirty && !isSaving
                            ? "bg-fifa-blue text-white hover:bg-blue-700"
                            : isSaved
                            ? "bg-green-500 text-white"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {isSaving ? "Saving…" : isSaved ? "Saved ✓" : groupDirty ? "Save Group" : "No changes"}
                      </button>
                      {groupError && (
                        <span className="text-[10px] text-red-500">{groupError}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "users" && isAdmin && (
        <>
        {/* Platform invite — send someone an invite to create their own group */}
        <div className="card mb-4">
          <h2 className="font-bold text-gray-800 text-sm mb-1">Invite someone to create their own group</h2>
          <p className="text-xs text-gray-400 mb-3">They&apos;ll receive an email with a link. When they click it they&apos;ll be promoted to Group Admin and land on the group creation page. You won&apos;t be added to their group.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setInviteSending(true);
              setInviteResult(null);
              const res = await fetch("/api/admin/platform-invites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail.trim() }),
              });
              const data = await res.json();
              setInviteResult(res.ok ? { ok: true } : { error: data.error ?? "Failed to send" });
              if (res.ok) setInviteEmail("");
              setInviteSending(false);
            }}
            className="flex gap-2 items-center"
          >
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fifa-blue"
            />
            <button type="submit" disabled={inviteSending} className="btn-primary text-sm px-4 py-2 shrink-0">
              {inviteSending ? "Sending…" : "Send Invite"}
            </button>
          </form>
          {inviteResult?.ok && <p className="text-xs text-green-600 mt-2">✓ Invite sent!</p>}
          {inviteResult?.error && <p className="text-xs text-red-500 mt-2">{inviteResult.error}</p>}
        </div>

        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-gray-800 text-sm">Group Admins ({users.length} {users.length === 1 ? "user" : "users"})</h2>
              <input
                type="search"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="ml-auto w-full sm:max-w-xs border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-fifa-blue"
                aria-label="Search users by name or email"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Promote any user to <strong>Group Admin</strong> to give them app-wide management access (results, settings, groups) without full admin rights. To remove a user from a specific group, open that group&apos;s Manage page instead.
            </p>
          </div>
          {!usersLoaded ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading users…</div>
          ) : (() => {
            const q = userSearch.trim().toLowerCase();
            const filteredUsers = q
              ? users.filter((u) => (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
              : users;
            if (filteredUsers.length === 0) {
              return (
                <p className="p-8 text-center text-gray-400 text-sm">
                  No users match "{userSearch}".
                  <button onClick={() => setUserSearch("")} className="ml-2 text-fifa-blue hover:underline">Clear</button>
                </p>
              );
            }
            return (
            <div className="overflow-x-auto">
            <table className="min-w-[600px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, i) => (
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
                        user.role === "GROUP_ADMIN" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {user.role === "ADMIN" ? "Admin" : user.role === "GROUP_ADMIN" ? "Group Admin" : "User"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.role !== "ADMIN" && user.id !== session.user.id && (
                        <button
                          onClick={() => handleRoleToggle(user.id, user.role)}
                          disabled={roleUpdating[user.id]}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition disabled:opacity-50 ${
                            user.role === "GROUP_ADMIN"
                              ? "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                              : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                          }`}
                        >
                          {roleUpdating[user.id]
                            ? "…"
                            : user.role === "GROUP_ADMIN"
                            ? "Remove Group Admin"
                            : "Make Group Admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            );
          })()}
        </div>
        </>
      )}
    </div>
  );
}


export default function AdminPageWrapper() {
  return (
    <Suspense>
      <AdminPage />
    </Suspense>
  );
}
