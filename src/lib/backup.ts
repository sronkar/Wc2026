import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

function resolveDbPath(): string | null {
  const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  const rawPath = dbUrl.replace(/^file:/, "");

  if (path.isAbsolute(rawPath)) return rawPath;

  // Prisma resolves relative paths from the prisma/ schema directory
  const fromPrismaDir = path.resolve(process.cwd(), "prisma", rawPath);
  if (fs.existsSync(fromPrismaDir)) return fromPrismaDir;

  const fromCwd = path.resolve(process.cwd(), rawPath);
  if (fs.existsSync(fromCwd)) return fromCwd;

  return null;
}

export async function createDailyBackup(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.startsWith("file:")) {
    // PostgreSQL and other remote databases are backed up by the hosting
    // provider (e.g. Railway automatic backups). Skip the SQLite-specific job.
    console.log("[backup] non-SQLite database detected — skipping file backup");
    return;
  }

  const dbPath = resolveDbPath();
  if (!dbPath) {
    console.warn("[backup] could not locate SQLite database file");
    return;
  }

  try {
    const backupDir = path.resolve(process.cwd(), "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const backupPath = path.join(backupDir, `backup-${stamp}.db`);

    // Skip if today's backup already exists
    if (fs.existsSync(backupPath)) {
      console.log(`[backup] today's backup already exists: ${backupPath}`);
      return;
    }

    // Defense-in-depth path validation. The path is internally generated from
    // a stable prefix + ISO date, but we still re-validate before passing it
    // through executeRawUnsafe (SQLite's VACUUM INTO can't be parameterised).
    // This bounds the blast radius if the date stamp ever becomes attacker-
    // influenced. Allowed shape: backups/backup-YYYY-MM-DD.db.
    const allowed = /^backup-\d{4}-\d{2}-\d{2}\.db$/;
    const baseName = path.basename(backupPath);
    if (!allowed.test(baseName) || baseName.includes("'") || baseName.includes("\\")) {
      console.error(`[backup] refusing to write suspicious path: ${backupPath}`);
      return;
    }
    const backupDirReal = fs.realpathSync(backupDir);
    const backupPathReal = path.resolve(backupDirReal, baseName);
    if (!backupPathReal.startsWith(backupDirReal + path.sep)) {
      console.error(`[backup] path escaped backup dir: ${backupPathReal}`);
      return;
    }

    // VACUUM INTO creates a consistent hot backup (SQLite 3.27+).
    // Path is validated above; SQLite has no $1-style param for VACUUM INTO.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPathReal}'`);
    console.log(`[backup] created ${backupPathReal}`);

    // Rotate: keep last 7 daily backups
    const existing = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".db"))
      .sort(); // YYYY-MM-DD is lexicographically chronological

    for (const old of existing.slice(0, Math.max(0, existing.length - 7))) {
      fs.unlinkSync(path.join(backupDir, old));
      console.log(`[backup] removed old backup: ${old}`);
    }
  } catch (err) {
    console.error("[backup] backup failed:", err);
  }
}
