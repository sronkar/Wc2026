import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WC2026_TEAMS } from "@/lib/teams";
import { requireGroupAdminAccess } from "@/lib/authz";

async function getDefaultLockTime(): Promise<Date> {
  const first = await prisma.match.findFirst({
    orderBy: { kickoff: "asc" },
    select: { kickoff: true },
  });
  return first
    ? new Date(first.kickoff.getTime() - 60 * 60 * 1000)
    : new Date("2026-06-11T21:00:00.000Z");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");

  // Group-scoped fetch: SUB_ADMIN must be an approved member of that group.
  // Global ADMIN always allowed; globals-only listing (no groupId) allowed for both.
  if (groupId) {
    const auth = await requireGroupAdminAccess(groupId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const preds = await prisma.customPrediction.findMany({
    where: groupId ? { OR: [{ groupId }, { isGlobal: true }] } : { isGlobal: true },
    orderBy: [{ isGlobal: "asc" }, { lockTime: "asc" }],
    include: {
      answers: {
        where: groupId ? { OR: [{ groupId }, { groupId: null }] } : {},
        include: { user: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json(
    preds.map((cp) => {
      const groupAnswers = (groupId && cp.isGlobal)
        ? cp.answers.filter((a) => a.groupId === groupId)
        : cp.answers;
      return {
        id: cp.id,
        groupId: cp.groupId,
        isGlobal: cp.isGlobal,
        question: cp.question,
        description: cp.description ?? null,
        optionType: cp.optionType,
        options: JSON.parse(cp.options) as string[],
        points: cp.points,
        lockTime: cp.lockTime.toISOString(),
        correctOption: cp.correctOption,
        status: cp.status,
        answerCount: groupAnswers.length,
        answers: groupAnswers.map((a) => ({
          userName: a.user.name ?? "Anonymous",
          option: a.option,
          points: a.points,
        })),
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Authorization rule: creating a GLOBAL custom prediction requires global ADMIN;
  // creating a group-scoped one requires ADMIN or SUB_ADMIN who's an approved
  // member of that specific group. Applied uniformly to single + batch POSTs.
  const requestedGroupId: string | undefined = body.groupId;
  const requestedIsGlobal: boolean = Boolean(body.isGlobal);
  if (requestedIsGlobal) {
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Only global ADMIN can create global custom predictions" }, { status: 403 });
    }
  } else if (requestedGroupId) {
    const auth = await requireGroupAdminAccess(requestedGroupId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  // If neither is set, downstream validation will reject with a 400.

  // ── Batch import ─────────────────────────────────────────────────────────────
  if (body.batch === true && Array.isArray(body.predictions)) {
    const { groupId, isGlobal, predictions, skipExisting = false } = body;
    if (!groupId && !isGlobal) return NextResponse.json({ error: "groupId or isGlobal required" }, { status: 400 });

    const defaultLockTime = await getDefaultLockTime();

    // When skipExisting: fetch existing question texts for dedup
    let existingQuestions = new Set<string>();
    if (skipExisting && isGlobal) {
      const existing = await prisma.customPrediction.findMany({
        where: { isGlobal: true },
        select: { question: true },
      });
      existingQuestions = new Set(existing.map((e) => e.question.trim().toLowerCase()));
    }

    const created = [];
    let skipped = 0;
    for (const p of predictions) {
      const question = String(p.question ?? "").trim();
      if (!question) continue;

      if (skipExisting && existingQuestions.has(question.toLowerCase())) {
        skipped++;
        continue;
      }

      const optionType: string = (p.optionType ?? "FIXED").toUpperCase();
      let options: string[];
      if (optionType === "TEAM") {
        options = WC2026_TEAMS;
      } else if (optionType === "PLAYER") {
        options = [];
      } else {
        options = (Array.isArray(p.options) ? p.options : []).map((o: string) => String(o).trim()).filter(Boolean);
        if (options.length < 2) continue;
      }

      const cp = await prisma.customPrediction.create({
        data: {
          groupId: isGlobal ? null : groupId,
          isGlobal: Boolean(isGlobal),
          question,
          description: p.description ? String(p.description).trim() || null : null,
          optionType,
          options: JSON.stringify(options),
          points: typeof p.points === "number" ? p.points : 3,
          lockTime: p.lockTime ? new Date(p.lockTime) : defaultLockTime,
        },
      });
      created.push({ ...cp, options });
    }
    return NextResponse.json({ created: created.length, skipped });
  }

  // ── Single create ─────────────────────────────────────────────────────────────
  const { groupId, isGlobal, question, description, optionType: rawType, options: rawOptions, points, lockTime } = body;
  const optionType: string = (rawType ?? "FIXED").toUpperCase();

  if (!groupId && !isGlobal) {
    return NextResponse.json({ error: "groupId or isGlobal required" }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  let options: string[];
  if (optionType === "TEAM") {
    options = WC2026_TEAMS;
  } else if (optionType === "PLAYER") {
    options = [];
  } else {
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
      return NextResponse.json({ error: "At least 2 options required for FIXED type" }, { status: 400 });
    }
    options = rawOptions.map((o: string) => String(o).trim()).filter(Boolean);
    if (options.length < 2) return NextResponse.json({ error: "At least 2 non-empty options required" }, { status: 400 });
  }

  const defaultLockTime = await getDefaultLockTime();

  const cp = await prisma.customPrediction.create({
    data: {
      groupId: isGlobal ? null : groupId,
      isGlobal: Boolean(isGlobal),
      question: String(question).trim(),
      description: description ? String(description).trim() || null : null,
      optionType,
      options: JSON.stringify(options),
      points: typeof points === "number" ? points : 3,
      lockTime: lockTime ? new Date(lockTime) : defaultLockTime,
    },
  });

  return NextResponse.json({ ...cp, options });
}
