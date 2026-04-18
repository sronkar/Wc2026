import { prisma } from "@/lib/prisma";

// Module-level virtual time (null = use real time)
let _virtualTimeMs: number | null = null;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function getNow(): Date {
  if (!isDemoMode() || _virtualTimeMs === null) return new Date();
  return new Date(_virtualTimeMs);
}

export function getNowMs(): number {
  return getNow().getTime();
}

export async function setVirtualTime(date: Date): Promise<void> {
  _virtualTimeMs = date.getTime();
  await prisma.demoSettings.upsert({
    where: { id: "demo" },
    update: { virtualTime: date },
    create: { id: "demo", virtualTime: date },
  });
}

export async function loadVirtualTime(): Promise<void> {
  if (!isDemoMode()) return;
  try {
    const settings = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
    if (settings) {
      _virtualTimeMs = settings.virtualTime.getTime();
      console.log(`[demo] virtual time restored: ${new Date(_virtualTimeMs).toISOString()}`);
    } else {
      _virtualTimeMs = Date.now();
      await prisma.demoSettings.create({
        data: { id: "demo", virtualTime: new Date(_virtualTimeMs) },
      });
      console.log(`[demo] virtual time initialised to real time`);
    }
  } catch (e) {
    console.error("[demo] failed to load virtual time:", e);
  }
}
