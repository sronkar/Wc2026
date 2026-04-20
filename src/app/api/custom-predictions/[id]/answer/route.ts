import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNowMs } from "@/lib/time";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cp = await prisma.customPrediction.findUnique({ where: { id: params.id } });
  if (!cp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { option, groupId } = await req.json();
  const effectiveGroupId: string | null = cp.groupId ?? groupId ?? null;

  // Verify membership in the group context
  if (effectiveGroupId) {
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: session.user.id, groupId: effectiveGroupId } },
    });
    if (membership?.status !== "APPROVED") {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }
  }

  if (getNowMs() >= cp.lockTime.getTime()) {
    return NextResponse.json({ error: "This prediction is locked" }, { status: 409 });
  }

  if (cp.status === "RESOLVED") {
    return NextResponse.json({ error: "This prediction has already been resolved" }, { status: 409 });
  }

  // For PLAYER type, any non-empty string is valid; for others validate against options
  if (cp.optionType !== "PLAYER") {
    const options: string[] = JSON.parse(cp.options);
    if (!options.includes(option)) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }
  } else if (!option?.trim()) {
    return NextResponse.json({ error: "Option is required" }, { status: 400 });
  }

  const answer = await prisma.customPredictionAnswer.upsert({
    where: { userId_customPredictionId_groupId: { userId: session.user.id, customPredictionId: params.id, groupId: effectiveGroupId ?? "" } },
    update: { option: option.trim() },
    create: { userId: session.user.id, customPredictionId: params.id, groupId: effectiveGroupId, option: option.trim() },
  });

  return NextResponse.json(answer);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cp = await prisma.customPrediction.findUnique({ where: { id: params.id } });
  if (!cp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  const effectiveGroupId: string | null = cp.groupId ?? groupId ?? null;

  if (getNowMs() >= cp.lockTime.getTime()) {
    return NextResponse.json({ error: "Prediction is locked" }, { status: 409 });
  }

  await prisma.customPredictionAnswer.deleteMany({
    where: {
      userId: session.user.id,
      customPredictionId: params.id,
      groupId: effectiveGroupId,
    },
  });

  return NextResponse.json({ ok: true });
}
