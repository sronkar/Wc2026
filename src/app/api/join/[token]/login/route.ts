import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encode } from "next-auth/jwt";
import { sendWelcomeEmail, sendJoinLinkVerificationEmail } from "@/lib/email";

type Ctx = { params: { token: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { email, name } = await req.json();

  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const group = await prisma.group.findUnique({
    where: { joinToken: params.token },
    select: { id: true, name: true },
  });
  if (!group) return NextResponse.json({ error: "invalid" }, { status: 404 });

  const normalizedEmail = email.trim().toLowerCase();

  // Find or create user
  // Note: emailVerified is NOT set here — ownership was not proven via email
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const isNewUser = !user;
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name.trim(),
        role: "USER",
      },
    });
  } else {
    const updates: Record<string, unknown> = {};
    if (!user.name) updates.name = name.trim();
    if (Object.keys(updates).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    }
  }

  // Join the group
  const existing = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: user.id, groupId: group.id } },
  });
  if (!existing) {
    await prisma.groupMembership.create({
      data: { userId: user.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" },
    });
  } else if (existing.status !== "APPROVED") {
    await prisma.groupMembership.update({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
      data: { status: "APPROVED" },
    });
  }

  // Issue a JWT session (strategy: "jwt" — no DB session row needed)
  const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
  const expires = new Date(Date.now() + maxAge * 1000);
  const jwt = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge,
  });

  const isProduction = process.env.NODE_ENV === "production";
  const cookieName = isProduction ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.json({ ok: true, groupId: group.id });
  response.cookies.set(cookieName, jwt, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires,
  });

  // Send welcome email non-blocking
  sendWelcomeEmail({
    to: normalizedEmail,
    name: user.name ?? "there",
    groupName: group.name,
    groupId: group.id,
  }).catch((e) => console.error("[join/login] welcome email failed:", e));

  // For new users joining via shared link, send a verification notice
  if (isNewUser) {
    sendJoinLinkVerificationEmail({
      to: normalizedEmail,
      name: user.name ?? "there",
      groupName: group.name,
    }).catch((e) => console.error("[join/login] verification email failed:", e));
  }

  return response;
}
