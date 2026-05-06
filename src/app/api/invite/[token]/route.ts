import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

type Ctx = { params: { token: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const ip = getClientIp(req);
  const hit = rateLimit(`invite:lookup:${ip}`, 30, 60 * 60 * 1000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(hit) }
    );
  }
  const invite = await prisma.groupInvite.findUnique({
    where: { token: params.token },
    include: { group: { select: { id: true, name: true, requirePassword: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired" }, { status: 410 });

  // Check if the current session user already has a password set
  const session = await getServerSession(authOptions);
  let userHasPassword = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
    userHasPassword = !!user?.password;
  }

  return NextResponse.json({
    groupId: invite.groupId,
    groupName: invite.group.name,
    requirePassword: invite.group.requirePassword,
    userHasPassword,
    email: invite.email,
    memberRole: invite.memberRole,
    expiresAt: invite.expiresAt.toISOString(),
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const ip = getClientIp(req);
  const ipHit = rateLimit(`invite:claim:${ip}`, 20, 60 * 60 * 1000);
  if (!ipHit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(ipHit) }
    );
  }
  const tokenHit = rateLimit(`invite:claim:token:${params.token}`, 10, 60 * 60 * 1000);
  if (!tokenHit.ok) {
    return NextResponse.json(
      { error: "Too many attempts for this invite" },
      { status: 429, headers: rateLimitHeaders(tokenHit) }
    );
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in to accept this invite" }, { status: 401 });
  }

  const invite = await prisma.groupInvite.findUnique({
    where: { token: params.token },
    include: { group: { select: { id: true, requirePassword: true } } },
  });

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
  if (invite.email !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: "This invite was sent to a different email address" }, { status: 403 });
  }

  // Enforce password requirement for authenticated users who don't have one yet
  if (invite.group.requirePassword) {
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });
    if (!dbUser?.password) {
      const body = await req.json().catch(() => ({})) as { password?: string };
      const { password } = body;
      if (!password?.trim() || password.trim().length < 12) {
        return NextResponse.json({ error: "This group requires a password (min. 12 characters)." }, { status: 400 });
      }
      const hash = await bcrypt.hash(password.trim(), 12);
      await prisma.user.update({ where: { id: session.user.id }, data: { password: hash } });
    }
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
