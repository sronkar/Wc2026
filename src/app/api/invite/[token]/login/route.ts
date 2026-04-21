import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";

type Ctx = { params: { token: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { name, password } = await req.json();

  const invite = await prisma.groupInvite.findUnique({
    where: { token: params.token },
    include: { group: { select: { id: true, name: true, requirePassword: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired" }, { status: 410 });

  if (invite.group.requirePassword) {
    if (!password?.trim()) {
      return NextResponse.json({ error: "A password is required to join this group" }, { status: 400 });
    }
    if (password.trim().length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
  }

  // Find or create user by the invite's email
  let user = await prisma.user.findUnique({ where: { email: invite.email } });

  const passwordHash = password?.trim() ? await bcrypt.hash(password.trim(), 12) : undefined;

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: invite.email,
        name: name?.trim() || null,
        emailVerified: new Date(),
        role: "USER",
        ...(passwordHash ? { password: passwordHash } : {}),
      },
    });
  } else {
    const updates: Record<string, unknown> = {};
    if (!user.name && name?.trim()) updates.name = name.trim();
    if (!user.emailVerified) updates.emailVerified = new Date();
    // Update password if one is provided (allows re-invite to reset password)
    if (passwordHash) updates.password = passwordHash;
    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    }
  }

  // Join the group
  await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId: user.id, groupId: invite.groupId } },
    update: { status: "APPROVED", memberRole: invite.memberRole },
    create: { userId: user.id, groupId: invite.groupId, status: "APPROVED", memberRole: invite.memberRole },
  });

  // Mark invite as accepted
  await prisma.groupInvite.update({ where: { token: params.token }, data: { status: "ACCEPTED" } });

  // Create a database session
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const isProduction = process.env.NODE_ENV === "production";
  const cookieName = isProduction ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.json({ ok: true, groupId: invite.groupId });
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires,
  });

  return response;
}
