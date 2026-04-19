import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
