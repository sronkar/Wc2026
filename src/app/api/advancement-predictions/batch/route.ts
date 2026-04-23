import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WC_GROUPS, ADVANCEMENT_LOCK_TIME } from "@/lib/wcGroups";
import { getNow } from "@/lib/time";

const VALID_PICKS = ["WINNER", "RUNNER_UP", "THIRD"] as const;
type ValidPick = typeof VALID_PICKS[number];

// Build a lookup: team → WC group letter
const TEAM_TO_WC_GROUP: Record<string, string> = {};
for (const [group, teams] of Object.entries(WC_GROUPS)) {
  for (const team of teams) TEAM_TO_WC_GROUP[team] = group;
}

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
    } else if (VALID_PICKS.includes(pick)) {
      upserts.push({ team, pick });
    }
  }

  // ── Server-side constraint validation ────────────────────────────────────────
  // Load all existing picks for this user+group, then apply the incoming changes
  // to compute the projected state and validate constraints.
  const existingPicks = await prisma.advancementPrediction.findMany({
    where: { userId: session.user.id, groupId },
    select: { team: true, pick: true },
  });

  const projected: Record<string, ValidPick> = {};
  for (const p of existingPicks) {
    if (VALID_PICKS.includes(p.pick as ValidPick)) projected[p.team] = p.pick as ValidPick;
  }
  // Apply deletions
  for (const team of deletes) delete projected[team];
  // Apply upserts
  for (const { team, pick } of upserts) projected[team] = pick;

  // Validate per-WC-group constraints
  for (const [wcGroup, wcTeams] of Object.entries(WC_GROUPS)) {
    const winners   = wcTeams.filter((t) => projected[t] === "WINNER").length;
    const runnerUps = wcTeams.filter((t) => projected[t] === "RUNNER_UP").length;
    const thirds    = wcTeams.filter((t) => projected[t] === "THIRD").length;
    if (winners > 1)   return NextResponse.json({ error: `Group ${wcGroup}: only 1 winner allowed` }, { status: 422 });
    if (runnerUps > 1) return NextResponse.json({ error: `Group ${wcGroup}: only 1 runner-up allowed` }, { status: 422 });
    if (thirds > 1)    return NextResponse.json({ error: `Group ${wcGroup}: only 1 advance-as-3rd allowed` }, { status: 422 });
  }
  // Validate global third-place cap
  const totalThirds = Object.values(projected).filter((p) => p === "THIRD").length;
  if (totalThirds > 8) {
    return NextResponse.json({ error: "Maximum 8 teams can advance as 3rd-place" }, { status: 422 });
  }

  await prisma.$transaction([
    // Delete cleared picks
    ...deletes.map((team) =>
      prisma.advancementPrediction.deleteMany({
        where: { userId: session.user.id, groupId, team },
      })
    ),
    // Upsert non-null picks (delete+create to avoid unique constraint issues)
    ...upserts.map(({ team, pick }) =>
      prisma.advancementPrediction.upsert({
        where: { userId_groupId_team: { userId: session.user.id, groupId, team } },
        create: { userId: session.user.id, groupId, team, pick },
        update: { pick },
      })
    ),
  ]);

  return NextResponse.json({ ok: true, upserted: upserts.length, deleted: deletes.length });
}
