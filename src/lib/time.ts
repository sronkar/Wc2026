import { prisma } from "@/lib/prisma";

// Use globalThis to persist state across hot reloads in dev
const g = globalThis as { __wc2026_sim?: { active: boolean; timeMs: number | null } };
if (!g.__wc2026_sim) g.__wc2026_sim = { active: false, timeMs: null };

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" || g.__wc2026_sim!.active;
}

export function isSimulationMode(): boolean {
  return g.__wc2026_sim!.active;
}

export function getNow(): Date {
  const sim = g.__wc2026_sim!;
  if (!isDemoMode() || sim.timeMs === null) return new Date();
  return new Date(sim.timeMs);
}

export function getNowMs(): number {
  return getNow().getTime();
}

export async function setVirtualTime(date: Date): Promise<void> {
  g.__wc2026_sim!.timeMs = date.getTime();
  await prisma.demoSettings.upsert({
    where: { id: "demo" },
    update: { virtualTime: date },
    create: { id: "demo", virtualTime: date },
  });
}

export async function setSimulationMode(active: boolean): Promise<void> {
  const sim = g.__wc2026_sim!;
  sim.active = active;
  if (active && sim.timeMs === null) {
    sim.timeMs = Date.now();
  }
  await prisma.demoSettings.upsert({
    where: { id: "demo" },
    update: { simulationActive: active, virtualTime: active ? new Date(sim.timeMs!) : new Date() },
    create: { id: "demo", simulationActive: active, virtualTime: new Date() },
  });
  if (!active) {
    sim.timeMs = null;
  }
}

export async function loadVirtualTime(): Promise<void> {
  try {
    const settings = await prisma.demoSettings.findUnique({ where: { id: "demo" } });
    if (!settings) {
      if (process.env.DEMO_MODE === "true") {
        g.__wc2026_sim!.timeMs = Date.now();
        await prisma.demoSettings.create({ data: { id: "demo", virtualTime: new Date(g.__wc2026_sim!.timeMs) } });
        console.log(`[time] virtual time initialised to real time`);
      }
      return;
    }

    if (settings.simulationActive) {
      g.__wc2026_sim!.active = true;
      g.__wc2026_sim!.timeMs = settings.virtualTime.getTime();
      console.log(`[time] simulation mode restored: virtual time = ${new Date(g.__wc2026_sim!.timeMs).toISOString()}`);
    } else if (process.env.DEMO_MODE === "true") {
      g.__wc2026_sim!.timeMs = settings.virtualTime.getTime();
      console.log(`[time] demo virtual time restored: ${new Date(g.__wc2026_sim!.timeMs).toISOString()}`);
    }
  } catch (e) {
    console.error("[time] failed to load virtual time:", e);
  }
}
