import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNowMs } from "@/lib/time";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "groupId is required" }, { status: 400 });

  const userId = session.user.id;
  const now = getNowMs();

  const preds = await prisma.customPrediction.findMany({
    where: { groupId },
    orderBy: { lockTime: "asc" },
    include: {
      answers: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  return NextResponse.json(
    preds.map((cp) => {
      const options: string[] = JSON.parse(cp.options);
      const isLocked = now >= cp.lockTime.getTime();
      const userAnswer = cp.answers.find((a) => a.userId === userId);

      // Only reveal all answers once locked
      const publicAnswers = isLocked
        ? cp.answers.map((a) => ({
            userId: a.userId,
            userName: a.user.name ?? "Anonymous",
            userImage: a.user.image,
            option: a.option,
            points: a.points,
          }))
        : null;

      const answerCounts = isLocked
        ? Object.fromEntries(options.map((o) => [o, cp.answers.filter((a) => a.option === o).length]))
        : null;

      return {
        id: cp.id,
        question: cp.question,
        options,
        points: cp.points,
        lockTime: cp.lockTime.toISOString(),
        isLocked,
        status: cp.status,
        correctOption: cp.status === "RESOLVED" ? cp.correctOption : null,
        userAnswer: userAnswer?.option ?? null,
        userPoints: userAnswer?.points ?? null,
        totalAnswers: cp.answers.length,
        answerCounts,
        answers: publicAnswers,
      };
    })
  );
}
