import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { matchId: string } };

/**
 * PATCH /api/admin/matches/[matchId]
 *
 * Edit homeTeam and/or awayTeam on a knockout match. Needed after group
 * stage ends because the seed bracket is hardcoded with placeholder teams
 * (e.g. M73 is always "Mexico vs Morocco") that may not reflect the actual
 * group-stage outcome.
 *
 * Safety:
 *   - Admin-only.
 *   - Group Stage matches cannot be edited (bracket is immutable there).
 *   - FINISHED matches cannot be edited (scoring is already closed).
 *   - Changing either team wipes existing Prediction rows for this match
 *     on the assumption that a "3-1 prediction for Mexico-Morocco" does not
 *     transfer cleanly to "Brazil-France".
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    homeTeam?: string;
    awayTeam?: string;
    dryRun?: boolean;
  };
  const homeTeam = body.homeTeam?.trim();
  const awayTeam = body.awayTeam?.trim();
  const dryRun = body.dryRun === true;
  if (!homeTeam && !awayTeam) {
    return NextResponse.json({ error: "Provide homeTeam and/or awayTeam" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: params.matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  if (match.round === "Group Stage") {
    return NextResponse.json({ error: "Group stage matches have fixed teams and cannot be edited" }, { status: 422 });
  }
  if (match.status === "FINISHED") {
    return NextResponse.json({ error: "Finished matches cannot be edited" }, { status: 422 });
  }

  const data: { homeTeam?: string; awayTeam?: string } = {};
  if (homeTeam && homeTeam !== match.homeTeam) data.homeTeam = homeTeam;
  if (awayTeam && awayTeam !== match.awayTeam) data.awayTeam = awayTeam;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, match, predictionsWiped: 0, unchanged: true });
  }

  // Dry run: report how many predictions would be wiped without touching them.
  // The admin UI calls this first to show an explicit confirmation prompt
  // ("This will delete N predictions across M groups") before committing.
  if (dryRun) {
    const grouped = await prisma.prediction.groupBy({
      by: ["groupId"],
      where: { matchId: params.matchId },
      _count: { _all: true },
    });
    const wouldWipe = grouped.reduce((s, g) => s + g._count._all, 0);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      wouldWipe,
      affectedGroups: grouped.length,
    });
  }

  // Change + wipe predictions in a single transaction. Any prediction for
  // this match was based on the OLD teams and is meaningless for the new ones.
  const result = await prisma.$transaction(async (tx) => {
    const wipe = await tx.prediction.deleteMany({ where: { matchId: params.matchId } });
    const updated = await tx.match.update({
      where: { id: params.matchId },
      data,
    });
    return { match: updated, predictionsWiped: wipe.count };
  });

  return NextResponse.json({ ok: true, ...result });
}
