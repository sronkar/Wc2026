const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GROUP_A_ID = 'cmob47t0r0001uikntl92u0gw';
const GROUP_B_ID = 'cmob47t0s0002uikn2s80hrp9';

// User IDs
const USERS = {
  sam:    'cmob1aijd0003kurl6n3644yf',
  riley:  'cmob1aijd0004kurl27n58ws2',
  jordan: 'cmob1aijc0002kurlhkh1gnqe',
  morgan: 'cmob1aijf0006kurlkq3fhf5s',
  casey:  'cmob1aije0005kurli2ebvroi',
  drew:   'cmob1aijg0008kurlsnh7u3j3',
  jamie:  'cmob1aijg0009kurlq1frtlr5',
  maya:   'cmob1aijb0001kurlestvog2f',
  taylor: 'cmob1aijf0007kurljqr2cg4c',
  alex:   'cmob1aij90000kurl8okrxyb6',
  pat:    'cmob47t0k0000uiknaj73ga7o',
};

// Each persona: { rate, seed, style }
// style: 'exact' = tries for exact, 'safe' = always 1-0 or 0-0, 'wild' = extreme, 'casual' = 0-0 blitz
const PERSONAS_A = [
  { userId: USERS.sam,    rate: 0.80, seed: 11, style: 'mixed' },
  { userId: USERS.riley,  rate: 1.00, seed: 22, style: 'safe' },
  { userId: USERS.jordan, rate: 0.00, seed: 33, style: 'mixed', knockoutsOnly: true }, // skips group stage
  { userId: USERS.morgan, rate: 0.95, seed: 44, style: 'bold' },
  { userId: USERS.casey,  rate: 0.70, seed: 55, style: 'mixed' },
];

const PERSONAS_B = [
  { userId: USERS.drew,   rate: 0.90, seed: 66, style: 'bold' },
  { userId: USERS.jamie,  rate: 0.95, seed: 77, style: 'mixed' },
  { userId: USERS.maya,   rate: 0.60, seed: 88, style: 'casual' },
  { userId: USERS.taylor, rate: 0.80, seed: 99, style: 'mixed' },
  { userId: USERS.alex,   rate: 0.85, seed: 13, style: 'mixed' },
  { userId: USERS.pat,    rate: 0.75, seed: 24, style: 'safe' },
  { userId: USERS.morgan, rate: 0.95, seed: 44, style: 'bold' }, // same predictions as Group A morgan
  { userId: USERS.casey,  rate: 0.70, seed: 55, style: 'mixed' }, // same as Group A casey
];

function seededRand(seed, n) {
  const x = Math.sin(seed + n * 9301 + 49297) * 233280;
  return (x - Math.floor(x));
}

function generatePrediction(style, matchNum, seed, round) {
  const r = seededRand(seed, matchNum);
  if (style === 'safe') {
    // Always 1-0 or 0-0
    return r < 0.6 ? [1, 0] : [0, 0];
  }
  if (style === 'casual') {
    // Mostly 0-0 blitz
    return r < 0.7 ? [0, 0] : [1, 1];
  }
  if (style === 'bold') {
    // Bold picks, tend to reflect likely winner more accurately
    const h = Math.floor(seededRand(seed + 1, matchNum) * 3) + 1;
    const a = Math.floor(seededRand(seed + 2, matchNum) * 2);
    return [h, a];
  }
  // mixed
  const h = Math.floor(seededRand(seed + 3, matchNum) * 3);
  const a = Math.floor(seededRand(seed + 4, matchNum) * 3);
  return [h, a];
}

// Actual match scores (from previous simulation knowledge)
const MATCH_SCORES = {};
// Group stage: generate consistent scores
function getMatchScore(matchNum) {
  if (MATCH_SCORES[matchNum]) return MATCH_SCORES[matchNum];
  // Use seed for deterministic "real" results
  const h = Math.floor(seededRand(999, matchNum * 7) * 3);
  const a = Math.floor(seededRand(998, matchNum * 11) * 3);
  return [h, a];
}

// Override key milestone matches
const OVERRIDES = {
  1:   [2, 1],  // Mexico 2-1 South Africa (M1 opener)
  9:   [5, 0],  // Germany blowout
  20:  [1, 1],  // Draw match
  69:  [2, 1],  // Colombia upset
  73:  [1, 2],  // R32-1 USA 1-2 France (Jordan's first prediction)
  74:  [3, 0],  // R32-2 Brazil 3-0 Mexico
  75:  [2, 1],  // R32-3
  76:  [2, 0],  // R32-4 Drew+Alex exact
  77:  [1, 1],  // R32-5 draw
  80:  [2, 0],  // R32-8
  89:  [1, 1],  // R16-1 draw
  90:  [2, 1],  // R16-2 Argentina upset
  91:  [0, 2],  // R16-3 USA 0-2 Spain
  92:  [1, 0],  // R16-4 England Riley exact
  97:  [1, 2],  // QF-1 Argentina upsets France
  98:  [0, 1],  // QF-2 Spain edges Germany
  99:  [2, 1],  // QF-3 England Brazil
  100: [3, 2],  // QF-4
  101: [2, 1],  // SF-1
  102: [1, 1],  // SF-2 draw
  103: [2, 0],  // Third place
  104: [1, 1],  // Final draw
};
for (const [k, v] of Object.entries(OVERRIDES)) MATCH_SCORES[parseInt(k)] = v;

async function main() {
  const matches = await prisma.match.findMany({ orderBy: { matchNumber: 'asc' }, select: { id: true, matchNumber: true, round: true } });
  const knockoutRounds = new Set(['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Third Place Play-off', 'Final']);

  let totalPreds = 0;
  const allPreds = [];

  for (const match of matches) {
    const isKnockout = knockoutRounds.has(match.round);

    for (const [groupId, personas] of [[GROUP_A_ID, PERSONAS_A], [GROUP_B_ID, PERSONAS_B]]) {
      for (const persona of personas) {
        // Jordan skips group stage entirely
        if (persona.userId === USERS.jordan && !isKnockout) continue;

        // Rate-based skip
        const r = seededRand(persona.seed * 2, match.matchNumber + groupId.charCodeAt(5));
        if (r > persona.rate) continue;

        const [h, a] = generatePrediction(persona.style, match.matchNumber, persona.seed, match.round);
        allPreds.push({
          userId: persona.userId,
          matchId: match.id,
          groupId,
          homeScore: h,
          awayScore: a,
          points: null,
        });
        totalPreds++;
      }
    }
  }

  // Bulk insert predictions in batches
  const BATCH = 200;
  for (let i = 0; i < allPreds.length; i += BATCH) {
    await prisma.prediction.createMany({ data: allPreds.slice(i, i + BATCH), skipDuplicates: true });
    process.stdout.write('.');
  }
  console.log('\nTotal predictions created:', totalPreds);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
