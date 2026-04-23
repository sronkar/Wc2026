/**
 * seed-simulation-predictions.js
 *
 * Bulk-inserts match predictions for the 10 simulation personas across all 104
 * WC2026 matches.  Run AFTER the simulation users and groups exist in the DB.
 *
 * Usage:
 *   node scripts/seed-simulation-predictions.js
 *
 * Persona emails must match what was used when creating the users
 * (see SIMULATION_USERS below).  Change GROUP_A_NAME / GROUP_B_NAME to match
 * the actual group names in your DB.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────────

const GROUP_A_NAME = 'World Cup Legends 2026';   // ← change to match your group name(s)
const GROUP_B_NAME = null;                        // ← set to a second group name, or null

// Persona email → prediction behaviour
const SIMULATION_USERS = [
  { email: 'alex@sim.test',   rate: 1.00, seed: 13, style: 'mixed',  knockoutsOnly: false },
  { email: 'maya@sim.test',   rate: 0.60, seed: 88, style: 'casual', knockoutsOnly: false },
  { email: 'jordan@sim.test', rate: 0.00, seed: 33, style: 'mixed',  knockoutsOnly: true  },
  { email: 'sam@sim.test',    rate: 0.80, seed: 11, style: 'mixed',  knockoutsOnly: false },
  { email: 'riley@sim.test',  rate: 1.00, seed: 22, style: 'safe',   knockoutsOnly: false },
  { email: 'casey@sim.test',  rate: 0.70, seed: 55, style: 'mixed',  knockoutsOnly: false, skipBefore: 14 }, // joins Jun 14
  { email: 'morgan@sim.test', rate: 0.85, seed: 44, style: 'bold',   knockoutsOnly: false },
  { email: 'taylor@sim.test', rate: 0.00, seed: 99, style: 'mixed',  knockoutsOnly: false }, // VISITOR — no predictions
  { email: 'drew@sim.test',   rate: 0.90, seed: 66, style: 'bold',   knockoutsOnly: false },
  { email: 'jamie@sim.test',  rate: 0.95, seed: 77, style: 'mixed',  knockoutsOnly: false },
];

// Score overrides for milestone matches (matchNumber → [home, away])
const SCORE_OVERRIDES = {
  1:   [2, 1],  // Mexico 2-1 South Africa (M1 opener)
  9:   [5, 0],  // Germany blowout
  20:  [1, 1],  // Draw match
  69:  [2, 1],  // Upset
  73:  [1, 2],  // R32-1 USA 1-2 France
  74:  [3, 0],  // R32-2 Brazil 3-0 Mexico
  75:  [2, 1],  // R32-3
  76:  [2, 0],  // R32-4
  77:  [1, 1],  // R32-5 draw
  80:  [2, 0],  // R32-8
  89:  [1, 1],  // R16-1 draw
  90:  [2, 1],  // R16-2 Argentina upset
  91:  [0, 2],  // R16-3 USA 0-2 Spain
  92:  [1, 0],  // R16-4 England
  97:  [1, 2],  // QF-1
  98:  [0, 1],  // QF-2
  99:  [2, 1],  // QF-3
  100: [3, 2],  // QF-4
  101: [2, 1],  // SF-1
  102: [1, 1],  // SF-2 draw
  103: [2, 0],  // 3rd place
  104: [1, 1],  // Final draw (Argentina pens)
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRand(seed, n) {
  const x = Math.sin(seed + n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function generatePrediction(style, matchNum, seed) {
  const r = seededRand(seed, matchNum);
  if (style === 'safe')   return r < 0.6 ? [1, 0] : [0, 0];
  if (style === 'casual') return r < 0.7 ? [0, 0] : [1, 1];
  if (style === 'bold') {
    const h = Math.floor(seededRand(seed + 1, matchNum) * 3) + 1;
    const a = Math.floor(seededRand(seed + 2, matchNum) * 2);
    return [h, a];
  }
  // mixed
  const h = Math.floor(seededRand(seed + 3, matchNum) * 3);
  const a = Math.floor(seededRand(seed + 4, matchNum) * 3);
  return [h, a];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve group IDs by name
  const groupA = GROUP_A_NAME
    ? await prisma.group.findFirst({ where: { name: GROUP_A_NAME }, select: { id: true, name: true } })
    : null;
  const groupB = GROUP_B_NAME
    ? await prisma.group.findFirst({ where: { name: GROUP_B_NAME }, select: { id: true, name: true } })
    : null;

  const groupIds = [groupA?.id, groupB?.id].filter(Boolean);
  if (!groupIds.length) {
    console.error('❌  No groups found. Create groups first or update GROUP_A_NAME / GROUP_B_NAME.');
    process.exit(1);
  }
  console.log(`✅  Groups: ${[groupA, groupB].filter(Boolean).map(g => `"${g.name}" (${g.id})`).join(', ')}`);

  // Resolve user IDs by email
  const userMap = {};
  for (const persona of SIMULATION_USERS) {
    const user = await prisma.user.findUnique({ where: { email: persona.email }, select: { id: true } });
    if (!user) {
      console.warn(`⚠️   User not found: ${persona.email} — skipping`);
      continue;
    }
    userMap[persona.email] = user.id;
  }
  console.log(`✅  Users resolved: ${Object.keys(userMap).length}/${SIMULATION_USERS.length}`);

  // Fetch all matches ordered by matchNumber
  const matches = await prisma.match.findMany({
    where: { isDemo: false },
    orderBy: { matchNumber: 'asc' },
    select: { id: true, matchNumber: true, round: true, kickoff: true },
  });
  console.log(`📋  Matches: ${matches.length}`);

  const knockoutRounds = new Set([
    'Round of 32', 'Round of 16', 'Quarter-final',
    'Semi-final', 'Third Place Play-off', 'Final',
  ]);

  const allPreds = [];

  for (const match of matches) {
    const isKnockout = knockoutRounds.has(match.round);
    const matchDay = new Date(match.kickoff).getDate(); // day-of-month as proxy for "joined after day X"

    for (const persona of SIMULATION_USERS) {
      const userId = userMap[persona.email];
      if (!userId) continue;

      // Jordan skips all group stage
      if (persona.knockoutsOnly && !isKnockout) continue;

      // Casey joins Jun 14 — skip matches on day < 14 (rough proxy)
      if (persona.skipBefore && matchDay < persona.skipBefore && !isKnockout) continue;

      // Rate-based skip (deterministic per persona+match)
      if (seededRand(persona.seed * 2, match.matchNumber) > persona.rate) continue;

      for (const groupId of groupIds) {
        const [h, a] = generatePrediction(persona.style, match.matchNumber, persona.seed);
        allPreds.push({
          userId,
          matchId: match.id,
          groupId,
          homeScore: h,
          awayScore: a,
          points: null,
        });
      }
    }
  }

  console.log(`🎲  Generating ${allPreds.length} predictions…`);

  // Bulk insert in batches of 200
  const BATCH = 200;
  for (let i = 0; i < allPreds.length; i += BATCH) {
    await prisma.prediction.createMany({
      data: allPreds.slice(i, i + BATCH),
      skipDuplicates: true,
    });
    process.stdout.write('.');
  }
  console.log(`\n✅  Done. Total inserted (skipping duplicates): ${allPreds.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
