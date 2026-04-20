import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

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
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name.trim(),
        emailVerified: new Date(),
        role: "USER",
      },
    });
  } else {
    const updates: Record<string, unknown> = {};
    if (!user.name) updates.name = name.trim();
    if (!user.emailVerified) updates.emailVerified = new Date();
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

  // Create a database session
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const isProduction = process.env.NODE_ENV === "production";
  const cookieName = isProduction ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.json({ ok: true, groupId: group.id });
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires,
  });

  return response;
}
