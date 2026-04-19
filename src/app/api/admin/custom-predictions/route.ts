import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const preds = await prisma.customPrediction.findMany({
    orderBy: { lockTime: "asc" },
    include: {
      answers: {
        include: { user: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json(
    preds.map((cp) => ({
      id: cp.id,
      question: cp.question,
      options: JSON.parse(cp.options) as string[],
      points: cp.points,
      lockTime: cp.lockTime.toISOString(),
      correctOption: cp.correctOption,
      status: cp.status,
      answerCount: cp.answers.length,
      answers: cp.answers.map((a) => ({
        userName: a.user.name ?? "Anonymous",
        option: a.option,
        points: a.points,
      })),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { question, options, points, lockTime } = await req.json();

  if (!question || !Array.isArray(options) || options.length < 2 || !lockTime) {
    return NextResponse.json({ error: "question, at least 2 options, and lockTime are required" }, { status: 400 });
  }

  const cleanOptions = options.map((o: string) => String(o).trim()).filter(Boolean);
  if (cleanOptions.length < 2) {
    return NextResponse.json({ error: "At least 2 non-empty options are required" }, { status: 400 });
  }

  const cp = await prisma.customPrediction.create({
    data: {
      question: String(question).trim(),
      options: JSON.stringify(cleanOptions),
      points: typeof points === "number" ? points : 3,
      lockTime: new Date(lockTime),
    },
  });

  return NextResponse.json({ ...cp, options: cleanOptions });
}
