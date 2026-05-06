import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  // Gate behind a session — the scoring formula was previously readable
  // anonymously, which is harmless on its own but unnecessarily exposes
  // configuration to anyone scraping the API surface.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await prisma.pointSettings.findUnique({
    where: { id: "default" },
  });
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { exactMatchPoints, directionMatchPoints } = await req.json();

  if (typeof exactMatchPoints !== "number" || typeof directionMatchPoints !== "number") {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  const settings = await prisma.pointSettings.upsert({
    where: { id: "default" },
    update: { exactMatchPoints, directionMatchPoints, updatedAt: new Date() },
    create: {
      id: "default",
      exactMatchPoints,
      directionMatchPoints,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(settings);
}
