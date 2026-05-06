import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

// User self-removes from a group. Distinct from admin Remove (DELETE on
// /api/admin/groups/[id]/members/[userId]) which requires admin auth and can
// remove anyone.
export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId: params.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 404 });
  }

  await prisma.groupMembership.delete({
    where: { userId_groupId: { userId: session.user.id, groupId: params.id } },
  });

  return NextResponse.json({ ok: true });
}
