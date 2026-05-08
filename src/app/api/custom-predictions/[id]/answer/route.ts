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

  // Verify membership in the group context.
  // For group-scoped predictions: must be an approved member of that specific group.
  // For global predictions (cp.groupId === null): must be an approved member of at least one group.
  if (effectiveGroupId) {
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: session.user.id, groupId: effectiveGroupId } },
    });
    if (membership?.status !== "APPROVED") {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }
  } else {
    // Global prediction — require membership in at least one group
    const anyMembership = await prisma.groupMembership.findFirst({
      where: { userId: session.user.id, status: "APPROVED" },
    });
    if (!anyMembership) {
      return NextResponse.json({ error: "Must be an approved group member to answer predictions" }, { status: 403 });
    }
  }

  if (getNowMs() >= cp.lockTime.getTime()) {
    return NextResponse.json({ error: "This prediction is locked" }, { status: 409 });
  }

  if (cp.status === "RESOLVED") {
    return NextResponse.json({ error: "This prediction has already been resolved" }, { status: 409 });
  }

  // FIXED: validate against stored options list.
  // TEAM / PLAYER: accept any non-empty string (team names and player names are
  // not stored as a fixed option list on the prediction row).
  if (cp.optionType === "FIXED") {
    const options: string[] = JSON.parse(cp.options);
    if (!options.includes(option)) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }
  } else if (!option?.trim()) {
    return NextResponse.json({ error: "Option is required" }, { status: 400 });
  }

  // NOTE: We can't use Prisma upsert here for global predictions because
  // `groupId` is nullable and SQLite treats two NULLs as distinct under a
  // composite unique index. An upsert with `groupId: ""` would never match the
  // existing row (which stores NULL) and would create a duplicate every call.
  // Use findFirst + update/create inside a transaction instead.
  const answer = await prisma.$transaction(async (tx) => {
    const existing = await tx.customPredictionAnswer.findFirst({
      where: {
        userId: session.user.id,
        customPredictionId: params.id,
        groupId: effectiveGroupId,
      },
      select: { id: true },
    });
    if (existing) {
      return tx.customPredictionAnswer.update({
        where: { id: existing.id },
        data: { option: option.trim() },
      });
    }
    return tx.customPredictionAnswer.create({
      data: {
        userId: session.user.id,
        customPredictionId: params.id,
        groupId: effectiveGroupId,
        option: option.trim(),
      },
    });
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
