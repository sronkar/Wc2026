/**
 * make-admin.js
 *
 * Promote an existing user to ADMIN role. Also supports demotion back to USER.
 *
 * Usage:
 *   node scripts/make-admin.js <email>
 *   node scripts/make-admin.js <email> --demote
 *
 * The user must already exist (signed in at least once via Google/magic-link,
 * or created through the password flow). This script only changes the role.
 */

/* eslint-disable no-console */
"use strict";

const { PrismaClient } = require("@prisma/client");

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const demote = args.includes("--demote");

  if (!email) {
    console.error("Usage: node scripts/make-admin.js <email> [--demote]");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      console.error(`No user found with email "${email}". They need to sign in once first.`);
      process.exit(1);
    }

    const newRole = demote ? "USER" : "ADMIN";
    if (user.role === newRole) {
      console.log(`No change: ${email} is already ${newRole}.`);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role: newRole },
    });

    console.log(`${email}: ${user.role} → ${newRole}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
