import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireGroupAdminAccess } from "@/lib/authz";

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const group = await prisma.group.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, description, avatar, exactMatchPoints, directionMatchPoints, stagePoints, isPublic, requirePassword } = await req.json();
  const data: Record<string, unknown> = {};
  if (name?.trim()) data.name = String(name).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (avatar !== undefined) data.avatar = avatar ? String(avatar).trim() : null;
  if (exactMatchPoints !== undefined) data.exactMatchPoints = Number(exactMatchPoints);
  if (directionMatchPoints !== undefined) data.directionMatchPoints = Number(directionMatchPoints);
  if (stagePoints !== undefined) data.stagePoints = typeof stagePoints === "string" ? stagePoints : JSON.stringify(stagePoints);
  if (isPublic !== undefined) data.isPublic = Boolean(isPublic);
  if (requirePassword !== undefined) data.requirePassword = Boolean(requirePassword);

  const updated = await prisma.group.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.group.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
