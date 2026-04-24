import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";
import { ADVANCEMENT_LOCK_TIME } from "@/lib/wcGroups";

/**
 * Returns true if advancement picks are locked.
 *
 * The lock is sticky: once virtual/real time has crossed ADVANCEMENT_LOCK_TIME,
 * we persist a flag on DemoSettings and the lock stays engaged even if an
 * admin later rewinds virtual time below the threshold. Without this, sim
 * mode's time-rewind lets users resubmit picks that were already frozen.
 *
 * The flag is cleared only on a full simulation deactivate/reset.
 */
export async function isAdvancementLocked(): Promise<boolean> {
  const settings = await prisma.demoSettings.findUnique({
    where: { id: "demo" },
    select: { advancementPicksLocked: true },
  });

  if (settings?.advancementPicksLocked) return true;

  if (getNow() >= ADVANCEMENT_LOCK_TIME) {
    // Lazily persist the sticky flag so future checks are O(1) and don't
    // depend on virtual time staying forward.
    await prisma.demoSettings.upsert({
      where: { id: "demo" },
      create: { id: "demo", advancementPicksLocked: true },
      update: { advancementPicksLocked: true },
    });
    return true;
  }

  return false;
}
