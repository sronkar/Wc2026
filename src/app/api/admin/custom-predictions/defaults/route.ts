import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WC2026_TEAMS } from "@/lib/teams";

const DEFAULT_PREDICTIONS = [
  { question: "Top Scorer", description: "In case of ties, all players are valid", optionType: "PLAYER", points: 4 },
  { question: "Team to Receive First Red Card", description: "This is globally (first red card in the tournament), not the earliest red card in a specific game.", optionType: "TEAM", teamSort: "BY_GAME_ORDER", points: 4 },
  { question: "Most Points in Group Stage", description: "In case of ties on points, all teams are valid", optionType: "TEAM", points: 4 },
  { question: "Least Goals Scored in Group Stage", description: "In case of ties, all teams are valid", optionType: "TEAM", points: 4 },
  { question: "Most Goals Scored in Group Stage", description: "In case of ties, all teams are valid", optionType: "TEAM", points: 4 },
  { question: "Least Goals Conceded in Group Stage", description: "In case of ties, all teams are valid", optionType: "TEAM", points: 4 },
  { question: "Most Goals Conceded in Group Stage", description: "In case of ties, all teams are valid", optionType: "TEAM", points: 4 },
  { question: "Team to Score Fastest Goal", description: "Based on official goal minute (not actual clock time). This is the earliest goal scored in the entire tournament. In case of ties, all teams are valid.", optionType: "TEAM", teamSort: "BY_GAME_ORDER", points: 4 },
  { question: "Finalist 1", description: null, optionType: "TEAM", points: 4 },
  { question: "Finalist 2", description: null, optionType: "TEAM", points: 4 },
  { question: "Winner", description: null, optionType: "TEAM", points: 10 },
];

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "GROUP_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const first = await prisma.match.findFirst({
    orderBy: { kickoff: "asc" },
    select: { kickoff: true },
  });
  const lockTime = first
    ? new Date(first.kickoff.getTime() - 60 * 60 * 1000)
    : new Date("2026-06-11T21:00:00.000Z");

  const existing = await prisma.customPrediction.findMany({
    where: { isGlobal: true },
    select: { question: true },
  });
  const existingSet = new Set(existing.map((e) => e.question.trim().toLowerCase()));

  let created = 0;
  let skipped = 0;

  for (const p of DEFAULT_PREDICTIONS) {
    if (existingSet.has(p.question.toLowerCase())) {
      skipped++;
      continue;
    }
    const options = p.optionType === "TEAM" ? WC2026_TEAMS : [];
    await prisma.customPrediction.create({
      data: {
        isGlobal: true,
        groupId: null,
        question: p.question,
        description: p.description,
        optionType: p.optionType,
        options: JSON.stringify(options),
        teamSort: (p as { teamSort?: string }).teamSort ?? "ALPHABETICAL",
        points: p.points,
        lockTime,
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: DEFAULT_PREDICTIONS.length });
}
