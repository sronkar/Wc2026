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

  const rawPreds = await prisma.customPrediction.findMany({
    where: { OR: [{ groupId }, { isGlobal: true }] },
    orderBy: [{ isGlobal: "asc" }, { lockTime: "asc" }],
    include: {
      answers: {
        where: { OR: [{ groupId }, { groupId: null }] },
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  // Sort: group-stage questions first, player awards second-to-last, finalist/winner last
  function predSortKey(q: string, optionType: string): number {
    const lower = q.toLowerCase();
    if (lower.includes("group stage")) return 0;
    if (lower.includes("finalist") || lower === "winner") return 3;
    if (optionType === "PLAYER") return 2;
    return 1;
  }
  const preds = [...rawPreds].sort(
    (a, b) => predSortKey(a.question, a.optionType) - predSortKey(b.question, b.optionType)
  );

  return NextResponse.json(
    preds.map((cp) => {
      const options: string[] = JSON.parse(cp.options);
      const isLocked = now >= cp.lockTime.getTime();

      // For global predictions, answers are scoped to this group
      // For group-specific predictions, all answers belong to the group already
      const groupAnswers = cp.isGlobal
        ? cp.answers.filter((a) => a.groupId === groupId)
        : cp.answers;

      const userAnswer = groupAnswers.find((a) => a.userId === userId);

      const publicAnswers = isLocked
        ? groupAnswers.map((a) => ({
            userId: a.userId,
            userName: a.user.name ?? "Anonymous",
            userImage: a.user.image,
            option: a.option,
            points: a.points,
          }))
        : null;

      const answerCounts = isLocked
        ? Object.fromEntries(options.map((o) => [o, groupAnswers.filter((a) => a.option === o).length]))
        : null;

      return {
        id: cp.id,
        question: cp.question,
        description: cp.description ?? null,
        optionType: cp.optionType,
        teamSort: cp.teamSort,
        isGlobal: cp.isGlobal,
        options,
        points: cp.points,
        lockTime: cp.lockTime.toISOString(),
        isLocked,
        status: cp.status,
        correctOption: cp.status === "RESOLVED" ? cp.correctOption : null,
        userAnswer: userAnswer?.option ?? null,
        userPoints: userAnswer?.points ?? null,
        totalAnswers: groupAnswers.length,
        answerCounts,
        answers: publicAnswers,
      };
    })
  );
}
