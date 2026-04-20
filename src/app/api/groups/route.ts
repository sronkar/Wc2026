import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, avatar, joinAsVisitor, isPublic } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const group = await prisma.group.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      avatar: avatar?.trim() || null,
      createdBy: session.user.id,
      isPublic: isPublic !== false, // default true
      memberships: {
        create: {
          userId: session.user.id,
          status: "APPROVED",
          memberRole: joinAsVisitor ? "VISITOR_ADMIN" : "MEMBER",
        },
      },
    },
  });

  return NextResponse.json(group, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const role = session.user.role;
  const isAdminRole = role === "ADMIN" || role === "SUB_ADMIN";
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";

  if (isAdminRole) {
    // Admins see all groups
    const groups = await prisma.group.findMany({
      orderBy: { createdAt: "asc" },
      include: { memberships: { select: { userId: true, status: true } } },
    });
    return NextResponse.json(groups.map((g) => {
      const mine = g.memberships.find((m) => m.userId === userId);
      return {
        id: g.id, name: g.name, description: g.description, avatar: g.avatar,
        isPublic: g.isPublic,
        memberCount: g.memberships.filter((m) => m.status === "APPROVED").length,
        myStatus: mine?.status ?? null,
        source: "member",
      };
    }));
  }

  // Non-admin: build a curated list
  const seen = new Set<string>();
  const results: {
    id: string; name: string; description: string | null; avatar: string | null;
    isPublic: boolean; memberCount: number; myStatus: string | null; source: string;
  }[] = [];

  // 1. Groups the user has a membership in (any status)
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    include: {
      group: {
        include: { memberships: { select: { status: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const m of memberships) {
    if (seen.has(m.groupId)) continue;
    seen.add(m.groupId);
    results.push({
      id: m.group.id, name: m.group.name, description: m.group.description,
      avatar: m.group.avatar, isPublic: m.group.isPublic,
      memberCount: m.group.memberships.filter((mb) => mb.status === "APPROVED").length,
      myStatus: m.status,
      source: "member",
    });
  }

  // 2. Groups the user has a pending email invite for
  if (session.user.email) {
    const invites = await prisma.groupInvite.findMany({
      where: { email: session.user.email, status: "PENDING", expiresAt: { gt: new Date() } },
      include: {
        group: { include: { memberships: { select: { status: true } } } },
      },
    });
    for (const inv of invites) {
      if (seen.has(inv.groupId)) continue;
      seen.add(inv.groupId);
      results.push({
        id: inv.group.id, name: inv.group.name, description: inv.group.description,
        avatar: inv.group.avatar, isPublic: inv.group.isPublic,
        memberCount: inv.group.memberships.filter((m) => m.status === "APPROVED").length,
        myStatus: "INVITED",
        source: "invite",
      });
    }
  }

  // 3. Public groups matching a search query (excludes already-seen)
  if (search) {
    const publicGroups = await prisma.group.findMany({
      where: {
        isPublic: true,
        name: { contains: search },
        id: { notIn: Array.from(seen) },
      },
      include: { memberships: { select: { userId: true, status: true } } },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    for (const g of publicGroups) {
      const mine = g.memberships.find((m) => m.userId === userId);
      results.push({
        id: g.id, name: g.name, description: g.description, avatar: g.avatar,
        isPublic: g.isPublic,
        memberCount: g.memberships.filter((m) => m.status === "APPROVED").length,
        myStatus: mine?.status ?? null,
        source: "search",
      });
    }
  }

  return NextResponse.json(results);
}
