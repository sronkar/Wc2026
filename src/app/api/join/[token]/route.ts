import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { token: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
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

export async function POST(_req: NextRequest, { params }: Ctx) {
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
