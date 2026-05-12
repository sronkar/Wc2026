import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/webpush";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { groupId } = await req.json().catch(() => ({})) as { groupId?: string };

  if (!groupId) {
    // Send only to the calling admin
    try {
      await sendPushToUser(session.user.id, {
        title: "⚽ SoccerPicks — push is working!",
        body: "This is a test notification sent to you from the admin panel.",
        url: "/admin",
        tag: "admin-test",
      });
      return NextResponse.json({ ok: true, sentTo: 1 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Send to all approved members of the group (excluding demo users)
  const memberships = await prisma.groupMembership.findMany({
    where: {
      groupId,
      status: "APPROVED",
      memberRole: { not: "VISITOR_ADMIN" },
      user: { isDemo: { not: true } },
    },
    select: { userId: true },
  });

  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });
  const groupName = group?.name ?? "your group";

  const results = await Promise.allSettled(
    memberships.map((m) =>
      sendPushToUser(m.userId, {
        title: "⚽ SoccerPicks — test from admin",
        body: `This is a test notification sent to members of "${groupName}".`,
        url: "/groups/" + groupId,
        tag: "admin-test",
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: true, sentTo: memberships.length, failed });
}
