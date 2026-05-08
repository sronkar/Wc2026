import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { role } = await req.json();
  if (role !== "USER" && role !== "GROUP_ADMIN") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (params.userId === session.user.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // The global admin can never be demoted — not by role check, not by email
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "The global admin role cannot be changed" }, { status: 403 });
  }
  if (process.env.ADMIN_EMAIL && target.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "The global admin role cannot be changed" }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json(updated);
}
