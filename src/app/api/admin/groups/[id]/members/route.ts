import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGroupAdminAccess } from "@/lib/authz";

type Ctx = { params: { id: string } };

// GET: return all memberships for a group (admin or group-scoped sub-admin)
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    group.memberships.map((m) => ({
      userId: m.userId,
      status: m.status,
      memberRole: m.memberRole,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    }))
  );
}

// POST: add a user directly as an approved member (admin or group-scoped sub-admin)
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { userId, memberRole = "MEMBER" } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const group = await prisma.group.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const membership = await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId, groupId: params.id } },
    update: { status: "APPROVED", memberRole },
    create: { userId, groupId: params.id, status: "APPROVED", memberRole },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });

  return NextResponse.json(membership);
}
