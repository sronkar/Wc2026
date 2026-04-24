import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADVANCEMENT_LOCK_TIME } from "@/lib/wcGroups";
import { getNow } from "@/lib/time";
import { POSITIVE_PICKS, validateProjectedPicks, type PositivePick } from "@/lib/advancementValidation";

// Batch endpoint only accepts WINNER/RUNNER_UP/THIRD; ELIMINATED is the
// implicit default for any team with no pick.
type ValidPick = PositivePick;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (getNow() >= ADVANCEMENT_LOCK_TIME) {
    return NextResponse.json({ error: "Advancement picks are locked" }, { status: 403 });
  }

  const { groupId, picks } = await req.json() as {
    groupId: string;
    picks: Record<string, ValidPick | null>;
  };

  if (!groupId || !picks) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED") {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }
  if (membership.memberRole === "VISITOR_ADMIN") {
    return NextResponse.json({ error: "Visitor admins cannot submit predictions" }, { status: 403 });
  }

  const teams = Object.keys(picks);
  const upserts: { team: string; pick: ValidPick }[] = [];
  const deletes: string[] = [];

  for (const team of teams) {
    const pick = picks[team];
    if (pick === null || pick === undefined) {
      deletes.push(team);
    } else if (POSITIVE_PICKS.includes(pick)) {
      upserts.push({ team, pick });
    }
  }

  // Read existing picks + validate projected state + mutate — all in one
  // transaction so concurrent submissions can't race past the constraints.
  const result = await prisma.$transaction(async (tx) => {
    const existingPicks = await tx.advancementPrediction.findMany({
      where: { userId: session.user.id, groupId },
      select: { team: true, pick: true },
    });

    const projected: Record<string, ValidPick> = {};
    for (const p of existingPicks) {
      if (POSITIVE_PICKS.includes(p.pick as ValidPick)) projected[p.team] = p.pick as ValidPick;
    }
    for (const team of deletes) delete projected[team];
    for (const { team, pick } of upserts) projected[team] = pick;

    const v = validateProjectedPicks(projected);
    if (!v.ok) return { status: v.status!, body: { error: v.error } };

    for (const team of deletes) {
      await tx.advancementPrediction.deleteMany({
        where: { userId: session.user.id, groupId, team },
      });
    }
    for (const { team, pick } of upserts) {
      await tx.advancementPrediction.upsert({
        where: { userId_groupId_team: { userId: session.user.id, groupId, team } },
        create: { userId: session.user.id, groupId, team, pick },
        update: { pick },
      });
    }
    return { status: 200 as const, body: { ok: true, upserted: upserts.length, deleted: deletes.length } };
  });

  return NextResponse.json(result.body, { status: result.status });
}
