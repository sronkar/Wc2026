import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/auditLog";

const VALID_RESULTS = ["WINNER", "RUNNER_UP", "THIRD", "ELIMINATED"] as const;

// Users only pick advancing teams (WINNER | RUNNER_UP | THIRD).
// "ELIMINATED" is never a user pick — it is the result for teams that don't advance.
function calcPoints(
  pick: string,
  result: string,
  exactPts: number,
  directionPts: number
): number {
  if (pick === result) return exactPts;      // Exact finish position → full points
  if (result === "ELIMINATED") return 0;     // Predicted to advance, team was eliminated → 0
  return directionPts;                       // Advanced but wrong position → partial
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "GROUP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolutions = await prisma.teamAdvancement.findMany();
  return NextResponse.json(resolutions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "GROUP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { team, result } = await req.json();
  if (!team || !result) return NextResponse.json({ error: "team and result required" }, { status: 400 });
  if (!VALID_RESULTS.includes(result)) return NextResponse.json({ error: "Invalid result" }, { status: 400 });

  const prior = await prisma.teamAdvancement.findUnique({ where: { team } });

  // Upsert the advancement result
  await prisma.teamAdvancement.upsert({
    where: { team },
    create: { team, result },
    update: { result, resolvedAt: new Date() },
  });

  if (session?.user?.id) {
    await logAdminAction({
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      action: prior ? "advancement.update" : "advancement.set",
      targetType: "advancement",
      targetId: team,
      before: prior ? { result: prior.result } : undefined,
      after: { result },
      context: `${team} → ${result}`,
    });
  }

  // Recalculate points for all predictions on this team
  const predictions = await prisma.advancementPrediction.findMany({
    where: { team },
    include: {
      group: { select: { id: true, exactMatchPoints: true, directionMatchPoints: true, stagePoints: true } },
    },
  });

  let updated = 0;
  for (const pred of predictions) {
    // Use stagePoints["Advancement"] if configured, else fall back to group base points
    let exactPts = pred.group.exactMatchPoints;
    let dirPts = pred.group.directionMatchPoints;
    try {
      const sp = JSON.parse(pred.group.stagePoints || "{}") as Record<string, { exact: number; direction: number }>;
      if (sp["Advancement"]) {
        exactPts = sp["Advancement"].exact;
        dirPts = sp["Advancement"].direction;
      }
    } catch { /* ignore parse errors */ }

    const pts = calcPoints(pred.pick, result, exactPts, dirPts);
    await prisma.advancementPrediction.update({
      where: { id: pred.id },
      data: { points: pts },
    });
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role !== "ADMIN" && role !== "GROUP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const team = req.nextUrl.searchParams.get("team");
  if (!team) return NextResponse.json({ error: "team required" }, { status: 400 });

  const prior = await prisma.teamAdvancement.findUnique({ where: { team } });
  await prisma.teamAdvancement.deleteMany({ where: { team } });
  // Reset points to null for all predictions on this team
  await prisma.advancementPrediction.updateMany({
    where: { team },
    data: { points: null },
  });

  if (session?.user?.id && prior) {
    await logAdminAction({
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      action: "advancement.unresolve",
      targetType: "advancement",
      targetId: team,
      before: { result: prior.result },
      context: `Cleared advancement for ${team}`,
    });
  }

  return NextResponse.json({ ok: true });
}
