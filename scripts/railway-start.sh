#!/bin/bash
set -e

echo "[start] Running prisma db push..."
npx prisma db push

echo "[start] Checking if database needs seeding..."
MATCH_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.match.count().then(n => { console.log(n); p.\$disconnect(); }).catch(() => { console.log(0); p.\$disconnect(); });
")

if [ "$MATCH_COUNT" = "0" ]; then
  echo "[start] Database is empty — seeding..."
  npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
  echo "[start] Seed complete."
else
  echo "[start] Database already has $MATCH_COUNT matches — skipping seed."
fi

echo "[start] Starting Next.js..."
exec npm start
