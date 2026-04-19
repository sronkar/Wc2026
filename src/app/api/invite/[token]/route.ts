import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { token: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const invite = await prisma.groupInvite.findUnique({
    where: { token: params.token },
    include: { group: { select: { id: true, name: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired" }, { status: 410 });

  return NextResponse.json({
    groupId: invite.groupId,
    groupName: invite.group.name,
    email: invite.email,
    memberRole: invite.memberRole,
    expiresAt: invite.expiresAt.toISOString(),
  });
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in to accept this invite" }, { status: 401 });
  }

  const invite = await prisma.groupInvite.findUnique({ where: { token: params.token } });

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  if (invite.email !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: "This invite was sent to a different email address" }, { status: 403 });
  }

  await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId: session.user.id, groupId: invite.groupId } },
    update: { status: "APPROVED", memberRole: invite.memberRole },
    create: { userId: session.user.id, groupId: invite.groupId, status: "APPROVED", memberRole: invite.memberRole },
  });

  await prisma.groupInvite.update({
    where: { token: params.token },
    data: { status: "ACCEPTED" },
  });

  return NextResponse.json({ ok: true, groupId: invite.groupId });
}
