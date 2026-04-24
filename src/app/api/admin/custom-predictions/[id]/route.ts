import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/time";
import { requireGroupAdminAccess } from "@/lib/authz";

type Ctx = { params: { id: string } };

/**
 * Authorize a SUB_ADMIN to act on the custom prediction identified by `cp`.
 * - ADMIN: always allowed.
 * - SUB_ADMIN: only for group-scoped predictions where they are a member.
 *   Global predictions are ADMIN-only to modify.
 */
async function authorizeCustomPredMutation(cp: { isGlobal: boolean; groupId: string | null }):
  Promise<{ ok: true } | { ok: false; status: 401 | 403; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, status: 401, error: "Unauthorized" };
  const role = session.user.role;
  if (role === "ADMIN") return { ok: true };
  if (role !== "SUB_ADMIN") return { ok: false, status: 403, error: "Forbidden" };
  // SUB_ADMIN can't touch globals
  if (cp.isGlobal || !cp.groupId) return { ok: false, status: 403, error: "Only ADMIN can modify global custom predictions" };
  const auth = await requireGroupAdminAccess(cp.groupId);
  return auth.ok ? { ok: true } : { ok: false, status: auth.status, error: auth.error };
}

// ── PATCH: edit metadata (pre-lock) or resolve (post-lock) ───────────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const cp = await prisma.customPrediction.findUnique({ where: { id: params.id } });
  if (!cp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = await authorizeCustomPredMutation(cp);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
  const cp = await prisma.customPrediction.findUnique({ where: { id: params.id } });
  if (!cp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = await authorizeCustomPredMutation(cp);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await prisma.customPrediction.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
