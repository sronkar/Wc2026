import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { sendWelcomeEmail } from "@/lib/email";
import { rateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

type Ctx = { params: { token: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const ip = getClientIp(req);
  const ipHit = rateLimit(`invite:login:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(ipHit) }
    );
  }
  const tokenHit = rateLimit(`invite:login:token:${params.token}`, 20, 60 * 60 * 1000);
  if (!tokenHit.ok) {
    return NextResponse.json(
      { error: "Too many attempts for this invite" },
      { status: 429, headers: rateLimitHeaders(tokenHit) }
    );
  }
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
    if (password.trim().length < 12) {
      return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
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

  // Issue a JWT session (strategy: "jwt" — no DB session row needed)
  const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
  const expires = new Date(Date.now() + maxAge * 1000);
  const jwt = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.image ?? undefined,
      role: user.role,
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge,
  });

  const isProduction = process.env.NODE_ENV === "production";
  const cookieName = isProduction ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.json({ ok: true, groupId: invite.groupId });
  response.cookies.set(cookieName, jwt, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires,
  });

  // Send welcome email non-blocking
  sendWelcomeEmail({
    to: user.email!,
    name: user.name ?? "there",
    groupName: invite.group.name,
    groupId: invite.groupId,
  }).catch((e) => console.error("[invite/login] welcome email failed:", e));

  return response;
}
