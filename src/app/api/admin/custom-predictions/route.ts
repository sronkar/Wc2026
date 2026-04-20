import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WC2026_TEAMS } from "@/lib/teams";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");

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
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // ── Batch import ─────────────────────────────────────────────────────────────
  if (body.batch === true && Array.isArray(body.predictions)) {
    const { groupId, isGlobal, predictions } = body;
    if (!groupId && !isGlobal) return NextResponse.json({ error: "groupId or isGlobal required" }, { status: 400 });

    const created = [];
    for (const p of predictions) {
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
          question: String(p.question).trim(),
          optionType,
          options: JSON.stringify(options),
          points: typeof p.points === "number" ? p.points : 3,
          lockTime: new Date(p.lockTime),
        },
      });
      created.push({ ...cp, options });
    }
    return NextResponse.json({ created: created.length });
  }

  // ── Single create ─────────────────────────────────────────────────────────────
  const { groupId, isGlobal, question, optionType: rawType, options: rawOptions, points, lockTime } = body;
  const optionType: string = (rawType ?? "FIXED").toUpperCase();

  if (!groupId && !isGlobal) {
    return NextResponse.json({ error: "groupId or isGlobal required" }, { status: 400 });
  }
  if (!question || !lockTime) {
    return NextResponse.json({ error: "question and lockTime are required" }, { status: 400 });
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

  const cp = await prisma.customPrediction.create({
    data: {
      groupId: isGlobal ? null : groupId,
      isGlobal: Boolean(isGlobal),
      question: String(question).trim(),
      optionType,
      options: JSON.stringify(options),
      points: typeof points === "number" ? points : 3,
      lockTime: new Date(lockTime),
    },
  });

  return NextResponse.json({ ...cp, options });
}
