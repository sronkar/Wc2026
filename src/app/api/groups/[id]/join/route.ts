import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const group = await prisma.group.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId: params.id } },
  });

  if (existing) {
    return NextResponse.json({ status: existing.status });
  }

  const membership = await prisma.groupMembership.create({
    data: { userId, groupId: params.id, status: "PENDING" },
  });

  console.log("\n========================================");
  console.log(`[JOIN REQUEST] ${session.user.name ?? session.user.email} wants to join "${group.name}"`);
  console.log(`[JOIN REQUEST] Group ID: ${params.id} · User ID: ${userId}`);
  console.log(`[JOIN REQUEST] Approve at: /admin/groups/${params.id}`);
  console.log("========================================\n");

  return NextResponse.json({ status: membership.status }, { status: 201 });
}
