import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyMatchResult } from "@/lib/scores";
import { notifyAdminOfSubAdminAction } from "@/lib/notifications";
import { logAdminAction } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!session?.user || (role !== "ADMIN" && role !== "GROUP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { matchId, homeScore, awayScore } = await req.json();

  if (typeof homeScore !== "number" || typeof awayScore !== "number") {
    return NextResponse.json({ error: "Invalid scores" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  // Immutability: once a result is recorded it is permanent
  if (match.status === "FINISHED") {
    return NextResponse.json(
      { error: "Result is already recorded and cannot be changed" },
      { status: 409 }
    );
  }

  await applyMatchResult(matchId, homeScore, awayScore);

  logAdminAction({
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    action: "match.score.set",
    targetType: "match",
    targetId: matchId,
    after: { homeScore, awayScore, homeTeam: match.homeTeam, awayTeam: match.awayTeam, matchNumber: match.matchNumber },
    context: `Set result for ${match.homeTeam} vs ${match.awayTeam} (#${match.matchNumber})`,
  });

  if (role === "GROUP_ADMIN") {
    notifyAdminOfSubAdminAction(
      session.user.name ?? "Group Admin",
      "score_update",
      {
        matchId,
        matchHomeTeam: match.homeTeam,
        matchAwayTeam: match.awayTeam,
        matchNumber: match.matchNumber,
        newHomeScore: homeScore,
        newAwayScore: awayScore,
        prevHomeScore: match.homeScore,
        prevAwayScore: match.awayScore,
      }
    ).catch((e) => console.error("[notifications] sub-admin notify failed:", e));
  }

  return NextResponse.json({ ok: true });
}
