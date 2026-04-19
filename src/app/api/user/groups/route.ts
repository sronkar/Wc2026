import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.groupMembership.findMany({
    where: { userId: session.user.id, status: "APPROVED" },
    include: { group: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      avatar: m.group.avatar,
    }))
  );
}
