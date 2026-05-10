import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";

const LOCK_OFFSET_MS = 60 * 60 * 1000; // 1 hour before first kickoff

export async function isDemoBotAddLocked(): Promise<boolean> {
  const first = await prisma.match.findFirst({
    orderBy: { kickoff: "asc" },
    select: { kickoff: true },
  });
  if (!first) return false;
  return getNow() >= new Date(first.kickoff.getTime() - LOCK_OFFSET_MS);
}
