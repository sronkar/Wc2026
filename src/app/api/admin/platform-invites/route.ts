import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPlatformInviteEmail } from "@/lib/email";
import crypto from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.platformInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(invites);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // Check if this email already has a GROUP_ADMIN or ADMIN account
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.role === "ADMIN" || existing?.role === "GROUP_ADMIN") {
    return NextResponse.json({ error: "User already has admin access" }, { status: 409 });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.platformInvite.create({
    data: { email, token, createdBy: session.user.id, expiresAt },
  });

  const inviteUrl = `${process.env.NEXTAUTH_URL}/platform-invite/${token}`;
  await sendPlatformInviteEmail(email, inviteUrl);

  return NextResponse.json({ ok: true });
}
