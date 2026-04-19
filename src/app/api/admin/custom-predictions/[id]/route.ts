import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { id: string } };

// ── PATCH: edit metadata (pre-lock) or resolve (post-lock) ───────────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cp = await prisma.customPrediction.findUnique({ where: { id: params.id } });
  if (!cp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // ── Resolve: set correct answer and award points ──
  if (body.action === "resolve") {
    const { correctOption } = body;
    const options: string[] = JSON.parse(cp.options);

    if (!options.includes(correctOption)) {
      return NextResponse.json({ error: "correctOption must be one of the defined options" }, { status: 400 });
    }

    await prisma.customPrediction.update({
      where: { id: params.id },
      data: { correctOption, status: "RESOLVED" },
    });

    // Award points to users who picked the correct option
    const answers = await prisma.customPredictionAnswer.findMany({
      where: { customPredictionId: params.id },
    });

    await Promise.all(
      answers.map((a) =>
        prisma.customPredictionAnswer.update({
          where: { id: a.id },
          data: { points: a.option === correctOption ? cp.points : 0 },
        })
      )
    );

    return NextResponse.json({ ok: true });
  }

  // ── Edit metadata (only allowed before lock time) ──
  if (new Date() >= cp.lockTime) {
    return NextResponse.json({ error: "Cannot edit a locked prediction" }, { status: 409 });
  }

  const { question, options, points, lockTime } = body;
  const updateData: Record<string, unknown> = {};
  if (question) updateData.question = String(question).trim();
  if (Array.isArray(options) && options.length >= 2) {
    const clean = options.map((o: string) => String(o).trim()).filter(Boolean);
    if (clean.length >= 2) updateData.options = JSON.stringify(clean);
  }
  if (typeof points === "number") updateData.points = points;
  if (lockTime) updateData.lockTime = new Date(lockTime);

  const updated = await prisma.customPrediction.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ ...updated, options: JSON.parse(updated.options) });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.customPrediction.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
