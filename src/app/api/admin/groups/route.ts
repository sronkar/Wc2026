import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const groups = await prisma.group.findMany({
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

  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      avatar: g.avatar,
      createdAt: g.createdAt.toISOString(),
      memberships: g.memberships.map((m) => ({
        userId: m.userId,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        user: m.user,
      })),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, avatar } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const group = await prisma.group.create({
    data: {
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      avatar: avatar ? String(avatar).trim() : null,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json({ ...group, memberships: [] }, { status: 201 });
}
