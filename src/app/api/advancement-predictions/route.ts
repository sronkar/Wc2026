import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { POSITIVE_PICKS, validateProjectedPicks, type ValidPick } from "@/lib/advancementValidation";
import { isAdvancementLocked } from "@/lib/advancementLock";
import { WC2026_TEAMS } from "@/lib/teams";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  const picks = await prisma.advancementPrediction.findMany({
    where: { userId: session.user.id, groupId },
  });

  // Return as Record<team, { pick, points }>
  const result: Record<string, { pick: string; points: number | null }> = {};
  for (const p of picks) {
    result[p.team] = { pick: p.pick, points: p.points };
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAdvancementLocked()) return NextResponse.json({ error: "Advancement picks are locked" }, { status: 403 });

  const { groupId, team, pick } = await req.json() as { groupId: string; team: string; pick: ValidPick };
  if (!groupId || !team || !pick) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (!POSITIVE_PICKS.includes(pick)) return NextResponse.json({ error: "Invalid pick" }, { status: 400 });
  // Reject team names that aren't actually in the WC2026 team list — without
  // this, a malformed client could insert garbage rows that later break
  // scoring (no TeamAdvancement row to match against).
  if (!WC2026_TEAMS.includes(team)) {
    return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  }

  // Verify membership
  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED" || membership.memberRole === "VISITOR_ADMIN") {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  // Read existing picks + validate projected state + upsert — all in one transaction.
  // Without this, two concurrent POSTs (same user, different teams, same WC group)
  // could both pass their individual constraint checks and land two WINNERs.
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.advancementPrediction.findMany({
      where: { userId: session.user.id, groupId },
      select: { team: true, pick: true },
    });

    const projected: Record<string, ValidPick> = {};
    for (const p of existing) {
      if (POSITIVE_PICKS.includes(p.pick as ValidPick)) projected[p.team] = p.pick as ValidPick;
    }
    projected[team] = pick; // apply the incoming change

    const v = validateProjectedPicks(projected);
    if (!v.ok) return { status: v.status!, body: { error: v.error } };

    const pred = await tx.advancementPrediction.upsert({
      where: { userId_groupId_team: { userId: session.user.id, groupId, team } },
      create: { userId: session.user.id, groupId, team, pick },
      update: { pick },
    });
    return { status: 200 as const, body: { pick: pred.pick, points: pred.points } };
  });

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isAdvancementLocked()) return NextResponse.json({ error: "Advancement picks are locked" }, { status: 403 });

  const groupId = req.nextUrl.searchParams.get("groupId");
  const team = req.nextUrl.searchParams.get("team");
  if (!groupId || !team) return NextResponse.json({ error: "groupId and team required" }, { status: 400 });

  await prisma.advancementPrediction.deleteMany({
    where: { userId: session.user.id, groupId, team },
  });

  return NextResponse.json({ ok: true });
}
