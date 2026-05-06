import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Hard cap to keep memory bounded as the group set grows. Caller can
  // page with ?cursor=<groupId> if needed; the admin UI loads page 1 today.
  const MAX_PAGE = 200;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") || undefined;

  const groups = await prisma.group.findMany({
    take: MAX_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "asc" },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const hasMore = groups.length > MAX_PAGE;
  const page = hasMore ? groups.slice(0, MAX_PAGE) : groups;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({
    groups: page.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      avatar: g.avatar,
      exactMatchPoints: g.exactMatchPoints,
      directionMatchPoints: g.directionMatchPoints,
      createdAt: g.createdAt.toISOString(),
      memberships: g.memberships.map((m) => ({
        userId: m.userId,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        user: m.user,
      })),
    })),
    nextCursor,
    hasMore,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, avatar, exactMatchPoints, directionMatchPoints } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Fall back to global PointSettings if per-group values not provided
  const globalSettings = await prisma.pointSettings.findUnique({ where: { id: "default" } });
  const resolvedExact = exactMatchPoints !== undefined ? Number(exactMatchPoints) : (globalSettings?.exactMatchPoints ?? 2);
  const resolvedDirection = directionMatchPoints !== undefined ? Number(directionMatchPoints) : (globalSettings?.directionMatchPoints ?? 1);

  const group = await prisma.group.create({
    data: {
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      avatar: avatar ? String(avatar).trim() : null,
      createdBy: session.user.id,
      exactMatchPoints: resolvedExact,
      directionMatchPoints: resolvedDirection,
    },
  });

  // Auto-add creator as approved member so they can access the group immediately
  await prisma.groupMembership.create({
    data: { userId: session.user.id, groupId: group.id, status: "APPROVED" },
  });

  return NextResponse.json({ ...group, memberships: [] }, { status: 201 });
}
