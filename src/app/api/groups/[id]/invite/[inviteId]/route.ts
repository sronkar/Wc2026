import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendGroupInviteEmail } from "@/lib/email";
import { randomBytes } from "crypto";

type Ctx = { params: { id: string; inviteId: string } };

const ROLE_LABELS: Record<string, string> = {
  MEMBER: "Member",
  ADMIN: "Admin",
  SUB_ADMIN: "Sub Admin",
  VISITOR_ADMIN: "Visitor Admin (no predictions)",
};

// POST /api/groups/[id]/invite/[inviteId] — resend an existing pending invite
export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const old = await prisma.groupInvite.findUnique({ where: { id: params.inviteId } });
  if (!old || old.groupId !== params.id) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (old.status !== "PENDING") {
    return NextResponse.json({ error: "Invite has already been used" }, { status: 410 });
  }

  const group = await prisma.group.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Delete the old invite and create a fresh one
  await prisma.groupInvite.delete({ where: { id: params.inviteId } });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const newInvite = await prisma.groupInvite.create({
    data: {
      groupId: params.id,
      email: old.email,
      memberRole: old.memberRole,
      token,
      expiresAt,
      createdBy: session.user.id,
    },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${token}`;
  const inviterUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });

  let emailSent = true;
  try {
    await sendGroupInviteEmail({
      to: old.email,
      groupName: group.name,
      roleLabel: ROLE_LABELS[old.memberRole] ?? old.memberRole,
      inviteUrl,
      requirePassword: group.requirePassword,
      inviterName: inviterUser?.name ?? undefined,
    });
  } catch {
    emailSent = false;
  }

  return NextResponse.json({
    ok: true,
    invite: { id: newInvite.id, expiresAt: newInvite.expiresAt.toISOString() },
    inviteUrl,
    emailSent,
  });
}
