import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { randomBytes } from "crypto";

type Ctx = { params: { id: string } };

const VALID_ROLES = ["MEMBER", "VISITOR_ADMIN"];

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  const roleLabel = memberRole === "VISITOR_ADMIN" ? "Visitor Admin (no predictions)" : "Member";

  await sendEmail({
    to: email.trim(),
    subject: `You're invited to join ${group.name} on WC2026 Predictions`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#003DA5;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">⚽ WC2026 Predictions</h1>
        </div>
        <div style="padding:24px">
          <p>You've been invited to join <strong>${group.name}</strong> as a <strong>${roleLabel}</strong>.</p>
          <p style="margin:24px 0">
            <a href="${inviteUrl}"
               style="display:inline-block;background:#003DA5;color:#fff;padding:14px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
              Accept Invitation →
            </a>
          </p>
          <p style="color:#888;font-size:12px">
            This invite expires in 7 days. If you didn't expect this, you can safely ignore it.
          </p>
        </div>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.groupInvite.findMany({
    where: { groupId: params.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invites);
}
