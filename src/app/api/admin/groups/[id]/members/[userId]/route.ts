import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string; userId: string } };

// PATCH: approve or reject a pending membership
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status } = await req.json();
  if (status !== "APPROVED" && status !== "REJECTED") {
    return NextResponse.json({ error: "status must be APPROVED or REJECTED" }, { status: 400 });
  }

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: params.userId, groupId: params.id } },
  });
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.groupMembership.update({
    where: { userId_groupId: { userId: params.userId, groupId: params.id } },
    data: { status },
  });

  if (status === "APPROVED") {
    const group = await prisma.group.findUnique({
      where: { id: params.id },
      select: { name: true },
    });
    const groupName = group?.name ?? "your group";
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: "join_approved",
        title: "You're in! 🎉",
        body: `Your request to join "${groupName}" was approved. Start predicting!`,
        read: false,
      },
    }).catch(() => {});
    const { sendPushToUser } = await import("@/lib/webpush");
    sendPushToUser(params.userId, {
      title: "You're in! 🎉",
      body: `Your request to join "${groupName}" was approved. Start predicting!`,
      url: `/groups/${params.id}`,
      tag: "join-approved",
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}

// DELETE: remove a member from the group entirely
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.groupMembership.deleteMany({
    where: { userId: params.userId, groupId: params.id },
  });

  return NextResponse.json({ ok: true });
}
