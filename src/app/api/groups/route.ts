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

  const { name, description, avatar } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const group = await prisma.group.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      avatar: avatar?.trim() || null,
      createdBy: session.user.id,
      memberships: {
        create: { userId: session.user.id, status: "APPROVED" },
      },
    },
  });

  return NextResponse.json(group, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const groups = await prisma.group.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      memberships: {
        select: { userId: true, status: true },
      },
    },
  });

  return NextResponse.json(
    groups.map((g) => {
      const mine = g.memberships.find((m) => m.userId === userId);
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        avatar: g.avatar,
        memberCount: g.memberships.filter((m) => m.status === "APPROVED").length,
        myStatus: mine?.status ?? null, // null = never requested
      };
    })
  );
}
