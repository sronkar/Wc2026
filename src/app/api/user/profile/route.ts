import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EMAIL_PREF_FIELDS = ["emailNotifications", "emailReminders", "emailLock30m", "emailPostGame"] as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, emailNotifications: true, emailReminders: true, emailLock30m: true, emailPostGame: true, allowDirectAdd: true },
  });

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if ("name" in body) {
    const trimmed = typeof body.name === "string" ? body.name.trim() : "";
    if (!trimmed) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (trimmed.length > 50) return NextResponse.json({ error: "Name too long (max 50 chars)" }, { status: 400 });
    updates.name = trimmed;
  }

  for (const field of EMAIL_PREF_FIELDS) {
    if (field in body) updates[field] = Boolean(body[field]);
  }

  if ("allowDirectAdd" in body) {
    updates.allowDirectAdd = Boolean(body.allowDirectAdd);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: updates,
    select: { id: true, name: true, email: true, emailNotifications: true, emailReminders: true, emailLock30m: true, emailPostGame: true, allowDirectAdd: true },
  });

  return NextResponse.json(updated);
}
