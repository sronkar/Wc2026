import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "GROUP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const players = await prisma.player.findMany({
    orderBy: [{ country: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(players);
}

// Bulk upsert players: [{ name, country, position?, number? }, ...]
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "GROUP_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const players: { name: string; country: string; position?: string; number?: number }[] =
    Array.isArray(body) ? body : body.players ?? [];

  if (players.length === 0) {
    return NextResponse.json({ error: "No players provided" }, { status: 400 });
  }

  // Bound the request size. Even an authenticated admin shouldn't be able to
  // OOM the node process by accidentally pasting a million-row CSV.
  const MAX_PLAYERS = 5000;
  if (players.length > MAX_PLAYERS) {
    return NextResponse.json(
      { error: `Too many players in one request (got ${players.length}, max ${MAX_PLAYERS})` },
      { status: 413 }
    );
  }

  let created = 0;
  let updated = 0;

  for (const p of players) {
    if (!p.name?.trim() || !p.country?.trim()) continue;
    const existing = await prisma.player.findFirst({
      where: { name: p.name.trim(), country: p.country.trim() },
    });
    if (existing) {
      await prisma.player.update({
        where: { id: existing.id },
        data: { position: p.position ?? null, number: p.number ?? null },
      });
      updated++;
    } else {
      await prisma.player.create({
        data: {
          name: p.name.trim(),
          country: p.country.trim(),
          position: p.position ?? null,
          number: p.number ?? null,
        },
      });
      created++;
    }
  }

  return NextResponse.json({ created, updated, total: created + updated });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { count } = await prisma.player.deleteMany();
  return NextResponse.json({ deleted: count });
}
