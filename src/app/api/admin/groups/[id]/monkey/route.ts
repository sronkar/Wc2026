import { NextRequest, NextResponse } from "next/server";
import { requireGroupAdminAccess } from "@/lib/authz";
import { addMonkeyToGroup, ensureMonkeyUser, removeDemoUserFromGroup } from "@/lib/monkey";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await addMonkeyToGroup(params.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const monkeyId = await ensureMonkeyUser();
  await removeDemoUserFromGroup(monkeyId, params.id);
  return NextResponse.json({ ok: true });
}
