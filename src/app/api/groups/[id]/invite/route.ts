import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendGroupInviteEmail } from "@/lib/email";
import { randomBytes } from "crypto";
import { requireGroupAdminAccess } from "@/lib/authz";

type Ctx = { params: { id: string } };

const VALID_ROLES = ["MEMBER", "ADMIN", "SUB_ADMIN", "VISITOR_ADMIN"];

const ROLE_LABELS: Record<string, string> = {
  MEMBER: "Member",
  ADMIN: "Admin",
  SUB_ADMIN: "Sub Admin",
  VISITOR_ADMIN: "Visitor Admin (no predictions)",
};

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const session = auth.session;

  const { email, memberRole = "MEMBER" } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!VALID_ROLES.includes(memberRole)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const group = await prisma.group.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.groupInvite.create({
    data: {
      groupId: params.id,
      email: email.trim().toLowerCase(),
      memberRole,
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
      to: email.trim(),
      groupName: group.name,
      roleLabel: ROLE_LABELS[memberRole] ?? memberRole,
      inviteUrl,
      requirePassword: group.requirePassword,
      inviterName: inviterUser?.name ?? undefined,
    });
  } catch {
    emailSent = false;
  }

  return NextResponse.json({ ok: true, inviteUrl, emailSent });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const invites = await prisma.groupInvite.findMany({
    where: { groupId: params.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invites);
}
