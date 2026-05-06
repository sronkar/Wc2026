import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";

export async function GET(
  _req: NextRequest,
  { params }: { params: { matchId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build the group filter:
  // - Global ADMIN sees predictions from every group.
  // - SUB_ADMIN sees only predictions from groups they are an APPROVED
  //   member of. Without this, a SUB_ADMIN could fetch every user's
  //   prediction in every group (cross-tenant data leak).
  let groupFilter: { groupId?: { in: string[] } } = {};
  if (role === "SUB_ADMIN") {
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: session.user.id, status: "APPROVED" },
      select: { groupId: true },
    });
    const allowedGroupIds = memberships.map((m) => m.groupId);
    if (allowedGroupIds.length === 0) {
      return NextResponse.json([]);
    }
    groupFilter = { groupId: { in: allowedGroupIds } };
  }

  const match = await prisma.match.findUnique({
    where: { id: params.matchId },
    select: { kickoff: true },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  // Pre-lock, an admin must NOT see other users' prediction values — they
  // could read them and update their own prediction to be optimal. The endpoint
  // still returns the membership (so the UI knows who has predicted) but the
  // scores are nulled until the lock window opens.
  const locked = isPredictionLocked(match.kickoff);

  const predictions = await prisma.prediction.findMany({
    where: { matchId: params.matchId, ...groupFilter },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return NextResponse.json(
    predictions.map((p) => ({
      id: p.id,
      userId: p.userId,
      userName: p.user.name ?? "Anonymous",
      userImage: p.user.image,
      homeScore: locked ? p.homeScore : null,
      awayScore: locked ? p.awayScore : null,
      points: p.points,
      hidden: !locked,
    }))
  );
}
