import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { ADVANCEMENT_LOCK_TIME } from "@/lib/wcGroups";
import { getNow } from "@/lib/time";

const VALID_PICKS = ["WINNER", "RUNNER_UP", "THIRD", "ELIMINATED"] as const;

function isLocked() {
  return getNow() >= ADVANCEMENT_LOCK_TIME;
}

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

  if (isLocked()) return NextResponse.json({ error: "Advancement picks are locked" }, { status: 403 });

  const { groupId, team, pick } = await req.json();
  if (!groupId || !team || !pick) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (!VALID_PICKS.includes(pick)) return NextResponse.json({ error: "Invalid pick" }, { status: 400 });

  // Verify membership
  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED" || membership.memberRole === "VISITOR_ADMIN") {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  const pred = await prisma.advancementPrediction.upsert({
    where: { userId_groupId_team: { userId: session.user.id, groupId, team } },
    create: { userId: session.user.id, groupId, team, pick },
    update: { pick },
  });

  return NextResponse.json({ pick: pred.pick, points: pred.points });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isLocked()) return NextResponse.json({ error: "Advancement picks are locked" }, { status: 403 });

  const groupId = req.nextUrl.searchParams.get("groupId");
  const team = req.nextUrl.searchParams.get("team");
  if (!groupId || !team) return NextResponse.json({ error: "groupId and team required" }, { status: 400 });

  await prisma.advancementPrediction.deleteMany({
    where: { userId: session.user.id, groupId, team },
  });

  return NextResponse.json({ ok: true });
}
