#!/usr/bin/env node
// Run once against production to rename SUB_ADMIN → GROUP_ADMIN
// Usage: DATABASE_URL="..." node scripts/migrate-group-admin.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const { count } = await prisma.user.updateMany({
    where: { role: "SUB_ADMIN" },
    data: { role: "GROUP_ADMIN" },
  });
  console.log(`Updated ${count} user(s) from SUB_ADMIN → GROUP_ADMIN`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
