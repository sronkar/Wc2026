import { prisma } from "./prisma";
import { WC_GROUPS } from "./wcGroups";

const GOAL_WEIGHTS = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4];

function randomGoals(): number {
  return GOAL_WEIGHTS[Math.floor(Math.random() * GOAL_WEIGHTS.length)];
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Remove a demo user (monkey or claudio) from a group — clears all their predictions in that group
export async function removeDemoUserFromGroup(userId: string, groupId: string): Promise<void> {
  await Promise.all([
    prisma.groupMembership.deleteMany({ where: { userId, groupId } }),
    prisma.prediction.deleteMany({ where: { userId, groupId } }),
    prisma.customPredictionAnswer.deleteMany({ where: { userId, groupId } }),
    prisma.advancementPrediction.deleteMany({ where: { userId, groupId } }),
  ]);
}

export async function ensureMonkeyUser(): Promise<string> {
  const monkey = await prisma.user.upsert({
    where: { email: "monkey@wc2026.internal" },
    update: {},
    create: { name: "🐒 Monkey", email: "monkey@wc2026.internal", role: "USER", isDemo: true },
    select: { id: true },
  });
  return monkey.id;
}

export async function addMonkeyToGroup(groupId: string): Promise<void> {
  const monkeyId = await ensureMonkeyUser();

  await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId: monkeyId, groupId } },
    update: {},
    create: { userId: monkeyId, groupId, status: "APPROVED", memberRole: "MEMBER" },
  });

  await Promise.all([
    fillMatchPredictions(monkeyId, groupId),
    fillCustomPredictions(monkeyId, groupId),
    fillAdvancementPredictions(monkeyId, groupId),
  ]);
}

// Fill predictions for ALL matches (all rounds, random scores)
async function fillMatchPredictions(monkeyId: string, groupId: string): Promise<void> {
  const allMatches = await prisma.match.findMany({ select: { id: true } });
  const validMatchIds = new Set(allMatches.map((m) => m.id));

  const existing = await prisma.prediction.findMany({
    where: { userId: monkeyId, groupId },
    select: { id: true, matchId: true },
  });

  // Remove stale predictions pointing at deleted matches
  const stale = existing.filter((p) => !validMatchIds.has(p.matchId)).map((p) => p.id);
  if (stale.length > 0) await prisma.prediction.deleteMany({ where: { id: { in: stale } } });

  const filledIds = new Set(existing.filter((p) => validMatchIds.has(p.matchId)).map((p) => p.matchId));
  const toCreate = allMatches.filter((m) => !filledIds.has(m.id));
  if (toCreate.length === 0) return;

  await prisma.prediction.createMany({
    data: toCreate.map((m) => ({
      userId: monkeyId,
      matchId: m.id,
      groupId,
      homeScore: randomGoals(),
      awayScore: randomGoals(),
    })),
  });
}

const ATTACKING_POSITIONS = ["MID", "FWD", "ATT", "AMF", "CAM", "LW", "RW", "ST", "SS", "CF", "LF", "RF"];

// Fill custom predictions (global + group-specific) with a random valid option
async function fillCustomPredictions(monkeyId: string, groupId: string): Promise<void> {
  const customPreds = await prisma.customPrediction.findMany({
    where: {
      status: { not: "DISABLED" },
      OR: [{ isGlobal: true }, { groupId }],
    },
    select: { id: true, question: true, options: true, optionType: true, isGlobal: true },
  });

  const answered = await prisma.customPredictionAnswer.findMany({
    where: { userId: monkeyId, groupId },
    select: { customPredictionId: true },
  });
  const answeredIds = new Set(answered.map((a: { customPredictionId: string }) => a.customPredictionId));

  // Pre-fetch attacker pool (for scoring questions like Top Scorer)
  const attackers = await prisma.player.findMany({
    where: { position: { in: ATTACKING_POSITIONS } },
    select: { name: true },
    take: 300,
  });
  // Fallback to any player if no attackers found
  const allPlayers = attackers.length > 0 ? attackers
    : await prisma.player.findMany({ select: { name: true }, take: 300 });

  for (const cp of customPreds) {
    if (answeredIds.has(cp.id)) continue;
    let option: string | null = null;
    if (cp.optionType === "PLAYER") {
      // Use attacker pool; fall back to the prediction's own options list if DB has no players
      if (allPlayers.length > 0) {
        option = pickRandom(allPlayers).name;
      } else {
        const opts: string[] = JSON.parse(cp.options);
        if (opts.length > 0) option = pickRandom(opts);
      }
    } else {
      const opts: string[] = JSON.parse(cp.options);
      if (opts.length > 0) option = pickRandom(opts);
    }
    if (!option) continue;
    await prisma.customPredictionAnswer.upsert({
      where: { userId_customPredictionId_groupId: { userId: monkeyId, customPredictionId: cp.id, groupId } },
      update: {},
      create: { userId: monkeyId, customPredictionId: cp.id, groupId, option },
    });
  }
}

// Fill advancement predictions: 1 winner + 1 runner-up per group, 8 random thirds
async function fillAdvancementPredictions(monkeyId: string, groupId: string): Promise<void> {
  const existing = await prisma.advancementPrediction.findMany({
    where: { userId: monkeyId, groupId },
    select: { team: true },
  });
  if (existing.length > 0) return; // already filled

  const picks: { userId: string; groupId: string; team: string; pick: string }[] = [];

  // 1 winner + 1 runner-up per WC group
  for (const [, teams] of Object.entries(WC_GROUPS)) {
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    picks.push({ userId: monkeyId, groupId, team: shuffled[0], pick: "WINNER" });
    picks.push({ userId: monkeyId, groupId, team: shuffled[1], pick: "RUNNER_UP" });
  }

  // 8 third-place picks — one from each of 8 randomly chosen WC groups
  const groupKeys = Object.keys(WC_GROUPS).sort(() => Math.random() - 0.5).slice(0, 8);
  for (const key of groupKeys) {
    const teams = WC_GROUPS[key];
    // Pick from the two teams not already chosen as winner/runner-up for this group
    const usedForGroup = picks.filter((p) => teams.includes(p.team)).map((p) => p.team);
    const remaining = teams.filter((t) => !usedForGroup.includes(t));
    if (remaining.length > 0) {
      picks.push({ userId: monkeyId, groupId, team: pickRandom(remaining), pick: "THIRD" });
    }
  }

  await prisma.advancementPrediction.createMany({ data: picks, skipDuplicates: true });
}
