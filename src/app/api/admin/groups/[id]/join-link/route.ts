import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

type Ctx = { params: { id: string } };

// POST: generate (or regenerate) the open join link for a group
export async function POST(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = randomBytes(24).toString("hex");
  const group = await prisma.group.update({
    where: { id: params.id },
    data: { joinToken: token },
    select: { id: true, name: true, joinToken: true },
  });

  const joinUrl = `${process.env.NEXTAUTH_URL}/join/${group.joinToken}`;
  return NextResponse.json({ joinUrl, token: group.joinToken });
}

// DELETE: revoke the open join link
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.group.update({ where: { id: params.id }, data: { joinToken: null } });
  return NextResponse.json({ ok: true });
}
