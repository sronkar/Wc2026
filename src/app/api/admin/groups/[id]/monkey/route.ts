import { NextRequest, NextResponse } from "next/server";
import { requireGroupAdminAccess } from "@/lib/authz";
import { addMonkeyToGroup } from "@/lib/monkey";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await addMonkeyToGroup(params.id);
  return NextResponse.json({ ok: true });
}
