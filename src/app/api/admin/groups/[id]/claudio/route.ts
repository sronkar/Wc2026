import { NextRequest, NextResponse } from "next/server";
import { requireGroupAdminAccess } from "@/lib/authz";
import { addClaudioToGroup, ensureClaudioUser } from "@/lib/claudio";
import { removeDemoUserFromGroup } from "@/lib/monkey";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await addClaudioToGroup(params.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const claudioId = await ensureClaudioUser();
  await removeDemoUserFromGroup(claudioId, params.id);
  return NextResponse.json({ ok: true });
}
