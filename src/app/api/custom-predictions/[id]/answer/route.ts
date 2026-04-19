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

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId: cp.groupId } },
  });
  if (membership?.status !== "APPROVED") {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  if (getNowMs() >= cp.lockTime.getTime()) {
    return NextResponse.json({ error: "This prediction is locked" }, { status: 409 });
  }

  if (cp.status === "RESOLVED") {
    return NextResponse.json({ error: "This prediction has already been resolved" }, { status: 409 });
  }

  const { option } = await req.json();
  const options: string[] = JSON.parse(cp.options);

  if (!options.includes(option)) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 });
  }

  const answer = await prisma.customPredictionAnswer.upsert({
    where: { userId_customPredictionId: { userId: session.user.id, customPredictionId: params.id } },
    update: { option },
    create: { userId: session.user.id, customPredictionId: params.id, option },
  });

  return NextResponse.json(answer);
}
