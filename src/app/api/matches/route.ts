import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const group = searchParams.get("group");
  const round = searchParams.get("round");

  const matches = await prisma.match.findMany({
    where: {
      ...(group ? { group } : {}),
      ...(round ? { round } : {}),
    },
    orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
  });

  return NextResponse.json(matches);
}
