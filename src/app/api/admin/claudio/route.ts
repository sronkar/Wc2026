import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureClaudioUser } from "@/lib/claudio";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const claudioId = await ensureClaudioUser();
  const [predCount, groupCount, latest] = await Promise.all([
    prisma.prediction.count({ where: { userId: claudioId } }),
    prisma.groupMembership.count({ where: { userId: claudioId, status: "APPROVED" } }),
    prisma.prediction.findFirst({
      where: { userId: claudioId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return NextResponse.json({
    predictionCount: predCount,
    groupCount,
    lastGenerated: latest?.updatedAt?.toISOString() ?? null,
  });
}

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server" }, { status: 500 });
  }

  const claudioId = await ensureClaudioUser();

  const matches = await prisma.match.findMany({
    where: { isDemo: false, status: { not: "FINISHED" } },
    select: { id: true, homeTeam: true, awayTeam: true, round: true, matchNumber: true },
    orderBy: { matchNumber: "asc" },
  });

  if (matches.length === 0) {
    return NextResponse.json({ generated: 0, message: "No upcoming matches to predict" });
  }

  const client = new Anthropic();
  const matchList = matches
    .map((m) => `- ID: ${m.id} | #${m.matchNumber} ${m.homeTeam} vs ${m.awayTeam} (${m.round})`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are an expert football analyst for the 2026 FIFA World Cup. Predict the final score for each match below.

Return ONLY a valid JSON array with no markdown, no explanation, no extra text. Format:
[{"matchId": "...", "homeScore": 2, "awayScore": 1}, ...]

Use realistic World Cup scores (most matches end 0-0 through 3-1). For knockout rounds with placeholder team names (e.g. "Winner Group A"), still make reasonable predictions. Include every match in your response.

Matches:
${matchList}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    return NextResponse.json({ error: "Unexpected AI response type" }, { status: 500 });
  }

  let predictions: { matchId: string; homeScore: number; awayScore: number }[];
  try {
    const raw = content.text.trim();
    // Strip markdown code fences if Claude added them
    const json = raw.startsWith("```") ? raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "") : raw;
    predictions = JSON.parse(json);
    if (!Array.isArray(predictions)) throw new Error("Not an array");
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: content.text }, { status: 500 });
  }

  const memberships = await prisma.groupMembership.findMany({
    where: { userId: claudioId, status: "APPROVED" },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);

  if (groupIds.length === 0) {
    return NextResponse.json({ generated: 0, message: "Claudio is not a member of any groups yet" });
  }

  let generated = 0;
  for (const pred of predictions) {
    if (!matches.find((m) => m.id === pred.matchId)) continue;
    const homeScore = Math.max(0, Math.round(Number(pred.homeScore)));
    const awayScore = Math.max(0, Math.round(Number(pred.awayScore)));
    for (const groupId of groupIds) {
      await prisma.prediction.upsert({
        where: { userId_matchId_groupId: { userId: claudioId, matchId: pred.matchId, groupId } },
        update: { homeScore, awayScore },
        create: { userId: claudioId, matchId: pred.matchId, groupId, homeScore, awayScore },
      });
      generated++;
    }
  }

  return NextResponse.json({
    generated,
    matchCount: predictions.length,
    groupCount: groupIds.length,
  });
}
