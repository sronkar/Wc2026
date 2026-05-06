import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureClaudioUser } from "@/lib/claudio";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const secret = process.env.CLAUDIO_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const researchContext: string = body.context ?? "";

  const claudioId = await ensureClaudioUser();

  const matches = await prisma.match.findMany({
    where: { isDemo: false, status: { not: "FINISHED" } },
    select: { id: true, homeTeam: true, awayTeam: true, round: true, matchNumber: true, kickoff: true },
    orderBy: { matchNumber: "asc" },
  });

  if (matches.length === 0) {
    return NextResponse.json({ generated: 0, message: "No upcoming matches to predict" });
  }

  const memberships = await prisma.groupMembership.findMany({
    where: { userId: claudioId, status: "APPROVED" },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) {
    return NextResponse.json({ generated: 0, message: "Claudio is not in any groups" });
  }

  const client = new Anthropic();
  const matchList = matches
    .map((m) => `- ID: ${m.id} | #${m.matchNumber} ${m.homeTeam} vs ${m.awayTeam} (${m.round}, kickoff: ${new Date(m.kickoff).toISOString()})`)
    .join("\n");

  const contextSection = researchContext
    ? `\nHere is today's sports research to inform your predictions:\n<research>\n${researchContext}\n</research>\n`
    : "";

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are an expert football analyst for the 2026 FIFA World Cup. Predict the final score for each upcoming match.${contextSection}
Return ONLY a valid JSON array with no markdown or explanation:
[{"matchId": "...", "homeScore": 2, "awayScore": 1}, ...]

Use realistic World Cup scores (0-3 goals per team is typical). Use the research above to make informed, intelligent predictions — consider team form, injuries, lineups, and head-to-head records. Include every match listed.

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
    const json = raw.startsWith("```") ? raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "") : raw;
    predictions = JSON.parse(json);
    if (!Array.isArray(predictions)) throw new Error("Not an array");
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: content.text }, { status: 500 });
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

  return NextResponse.json({ generated, matchCount: predictions.length, groupCount: groupIds.length });
}
