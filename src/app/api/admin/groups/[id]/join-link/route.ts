import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { requireGroupAdminAccess } from "@/lib/authz";

type Ctx = { params: { id: string } };

// POST: generate (or regenerate) the open join link for a group
export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await prisma.group.update({ where: { id: params.id }, data: { joinToken: null } });
  return NextResponse.json({ ok: true });
}
