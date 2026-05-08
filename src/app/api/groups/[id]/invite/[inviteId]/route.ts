import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendGroupInviteEmail } from "@/lib/email";
import { randomBytes } from "crypto";
import { requireGroupAdminAccess } from "@/lib/authz";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

type Ctx = { params: { id: string; inviteId: string } };

const ROLE_LABELS: Record<string, string> = {
  MEMBER: "Member",
  ADMIN: "Admin",
  GROUP_ADMIN: "Group Admin",
  VISITOR_ADMIN: "Visitor Admin (no predictions)",
};

// POST /api/groups/[id]/invite/[inviteId] — resend an existing pending invite
export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const session = auth.session;

  // Resend counts toward the same inviter rate limit as sending a fresh invite.
  const hit = rateLimit(`invite:user:${session.user.id}`, 20, 60 * 60 * 1000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Invite rate limit reached. Try again later." },
      { status: 429, headers: rateLimitHeaders(hit) }
    );
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
  } catch (err) {
    emailSent = false;
    console.warn("[invite-resend] email send failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    ok: true,
    invite: { id: newInvite.id, expiresAt: newInvite.expiresAt.toISOString() },
    inviteUrl,
    emailSent,
  });
}
