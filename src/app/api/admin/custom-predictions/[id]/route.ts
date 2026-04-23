import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";

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

  // ── Disable: hide from users without deleting ──
  if (body.action === "disable") {
    await prisma.customPrediction.update({ where: { id: params.id }, data: { status: "DISABLED" } });
    return NextResponse.json({ ok: true });
  }

  // ── Enable: re-open a disabled prediction ──
  if (body.action === "enable") {
    await prisma.customPrediction.update({ where: { id: params.id }, data: { status: "OPEN" } });
    return NextResponse.json({ ok: true });
  }

  // ── Unresolve: revert to OPEN and clear points ──
  if (body.action === "unresolve") {
    await prisma.customPrediction.update({
      where: { id: params.id },
      data: { correctOption: null, status: "OPEN" },
    });
    // Reset all answer points to null
    await prisma.customPredictionAnswer.updateMany({
      where: { customPredictionId: params.id },
      data: { points: null },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Resolve: set correct answers and award points ──
  if (body.action === "resolve") {
    const { correctOption } = body;
    if (!correctOption?.trim()) return NextResponse.json({ error: "correctOption is required" }, { status: 400 });

    // Store as comma-separated canonical string (trimmed values)
    const correctValues = (correctOption as string)
      .split(",")
      .map((v: string) => v.trim())
      .filter(Boolean);
    if (correctValues.length === 0) return NextResponse.json({ error: "No valid values provided" }, { status: 400 });

    const stored = correctValues.join(",");

    await prisma.customPrediction.update({
      where: { id: params.id },
      data: { correctOption: stored, status: "RESOLVED" },
    });

    const answers = await prisma.customPredictionAnswer.findMany({
      where: { customPredictionId: params.id },
    });

    const isMatch = (answer: string) => {
      const a = answer.trim().toLowerCase();
      return correctValues.some((v) => v.toLowerCase() === a);
    };

    await Promise.all(
      answers.map((a) =>
        prisma.customPredictionAnswer.update({
          where: { id: a.id },
          data: { points: isMatch(a.option) ? cp.points : 0 },
        })
      )
    );

    return NextResponse.json({ ok: true, awarded: answers.filter((a) => isMatch(a.option)).length });
  }

  // ── Edit metadata (only allowed before lock time) ──
  if (getNow() >= cp.lockTime) {
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
