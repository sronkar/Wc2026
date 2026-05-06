import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

type Ctx = { params: { token: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  // Per-IP rate limit on token lookups so a single attacker can't brute force
  // the token space (defense in depth — tokens are 32-byte hex, but a shared
  // cap is cheap insurance and bounds noise in our logs).
  const ip = getClientIp(req);
  const hit = rateLimit(`join:lookup:${ip}`, 30, 60 * 60 * 1000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(hit) }
    );
  }
  const group = await prisma.group.findUnique({
    where: { joinToken: params.token },
    select: { id: true, name: true, description: true, memberships: { select: { status: true } } },
  });
  if (!group) return NextResponse.json({ error: "invalid" }, { status: 404 });
  return NextResponse.json({
    groupId: group.id,
    groupName: group.name,
    description: group.description,
    memberCount: group.memberships.filter((m) => m.status === "APPROVED").length,
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const ip = getClientIp(req);
  const hit = rateLimit(`join:claim:${ip}`, 20, 60 * 60 * 1000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(hit) }
    );
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({
    where: { joinToken: params.token },
    select: { id: true, name: true },
  });

  if (!group) return NextResponse.json({ error: "invalid" }, { status: 404 });

  const existing = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId: group.id } },
  });

  if (existing?.status === "APPROVED") {
    return NextResponse.json({ groupId: group.id, groupName: group.name, alreadyMember: true });
  }

  if (existing) {
    // Upgrade pending/rejected to approved
    await prisma.groupMembership.update({
      where: { userId_groupId: { userId: session.user.id, groupId: group.id } },
      data: { status: "APPROVED" },
    });
  } else {
    await prisma.groupMembership.create({
      data: { userId: session.user.id, groupId: group.id, status: "APPROVED", memberRole: "MEMBER" },
    });
  }

  return NextResponse.json({ groupId: group.id, groupName: group.name, alreadyMember: false });
}
