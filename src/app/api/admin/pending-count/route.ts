import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ count: 0 });
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN") return NextResponse.json({ count: 0 });

  try {
    const count = await prisma.groupMembership.count({ where: { status: "PENDING" } });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
