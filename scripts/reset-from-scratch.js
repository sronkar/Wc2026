// Wipe all user-generated data and reset the tournament to pre-kickoff.
// Keeps: Match fixtures (results cleared), Player records, PointSettings.
// Run from repo root: node scripts/reset-from-scratch.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const counts = {};
  const log = (label, n) => {
    counts[label] = n;
    console.log(`  ${label}: ${n}`);
  };

  console.log("==> Wiping notifications + push state");
  log("Notification", (await prisma.notification.deleteMany()).count);
  log("PushSubscription", (await prisma.pushSubscription.deleteMany()).count);
  log("MatchReminder", (await prisma.matchReminder.deleteMany()).count);

  console.log("==> Wiping predictions");
  log("Prediction", (await prisma.prediction.deleteMany()).count);
  log("AdvancementPrediction", (await prisma.advancementPrediction.deleteMany()).count);
  log("CustomPredictionAnswer", (await prisma.customPredictionAnswer.deleteMany()).count);
  log("CustomPrediction", (await prisma.customPrediction.deleteMany()).count);

  console.log("==> Wiping groups");
  log("GroupInvite", (await prisma.groupInvite.deleteMany()).count);
  log("GroupMembership", (await prisma.groupMembership.deleteMany()).count);
  log("Group", (await prisma.group.deleteMany()).count);

  console.log("==> Wiping auth + users");
  log("Session", (await prisma.session.deleteMany()).count);
  log("Account", (await prisma.account.deleteMany()).count);
  log("VerificationToken", (await prisma.verificationToken.deleteMany()).count);
  log("User", (await prisma.user.deleteMany()).count);

  console.log("==> Wiping sim + cron state");
  log("SimulationScoredMatch", (await prisma.simulationScoredMatch.deleteMany()).count);
  log("JobLock", (await prisma.jobLock.deleteMany()).count);
  log("SystemHealth", (await prisma.systemHealth.deleteMany()).count);

  console.log("==> Clearing tournament results");
  log("TeamAdvancement", (await prisma.teamAdvancement.deleteMany()).count);
  const matchReset = await prisma.match.updateMany({
    data: { homeScore: null, awayScore: null, status: "SCHEDULED" },
  });
  log("Match results cleared", matchReset.count);

  console.log("==> Resetting DemoSettings (sim deactivated, time = now)");
  await prisma.demoSettings.upsert({
    where: { id: "demo" },
    update: {
      virtualTime: new Date(),
      simulationActive: false,
      advancementPicksLocked: false,
    },
    create: {
      id: "demo",
      virtualTime: new Date(),
      simulationActive: false,
      advancementPicksLocked: false,
    },
  });

  console.log("\n==> Survivors");
  console.log(`  Match: ${await prisma.match.count()}`);
  console.log(`  Player: ${await prisma.player.count()}`);
  console.log(`  PointSettings: ${await prisma.pointSettings.count()}`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
