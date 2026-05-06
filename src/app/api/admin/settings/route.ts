import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defaultStagePoints } from "@/lib/stagePoints";

export async function GET() {
  const settings = await prisma.pointSettings.findUnique({
    where: { id: "default" },
  });
  // Return a fully-populated default record if none has been saved yet, so the
  // admin UI doesn't render an empty form.
  if (!settings) {
    return NextResponse.json({
      id: "default",
      exactMatchPoints: 5,
      directionMatchPoints: 1,
      stagePoints: JSON.stringify(defaultStagePoints()),
    });
  }
  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { exactMatchPoints, directionMatchPoints, stagePoints } = await req.json();

  if (typeof exactMatchPoints !== "number" || typeof directionMatchPoints !== "number") {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  const stagePointsStr = stagePoints === undefined
    ? undefined
    : typeof stagePoints === "string"
      ? stagePoints
      : JSON.stringify(stagePoints);

  const settings = await prisma.pointSettings.upsert({
    where: { id: "default" },
    update: {
      exactMatchPoints,
      directionMatchPoints,
      ...(stagePointsStr !== undefined ? { stagePoints: stagePointsStr } : {}),
      updatedAt: new Date(),
    },
    create: {
      id: "default",
      exactMatchPoints,
      directionMatchPoints,
      stagePoints: stagePointsStr ?? JSON.stringify(defaultStagePoints()),
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(settings);
}
