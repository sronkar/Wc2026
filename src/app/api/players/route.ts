import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) return NextResponse.json([]);

  // Country matches first (e.g. "Franc" → all French players before "Franco Armani")
  const [countryMatches, nameMatches] = await Promise.all([
    prisma.player.findMany({
      where: { country: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 25,
      select: { id: true, name: true, country: true, position: true, number: true },
    }),
    prisma.player.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 15,
      select: { id: true, name: true, country: true, position: true, number: true },
    }),
  ]);

  const countryIds = new Set(countryMatches.map((p: { id: string }) => p.id));
  const deduped = nameMatches.filter((p: { id: string }) => !countryIds.has(p.id));
  const players = [...countryMatches, ...deduped].slice(0, 30);

  return NextResponse.json(players);
}
