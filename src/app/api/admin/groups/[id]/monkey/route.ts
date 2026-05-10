import { NextRequest, NextResponse } from "next/server";
import { requireGroupAdminAccess } from "@/lib/authz";
import { addMonkeyToGroup, ensureMonkeyUser, removeDemoUserFromGroup } from "@/lib/monkey";
import { isDemoBotAddLocked } from "@/lib/demoBotLock";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (await isDemoBotAddLocked()) {
    return NextResponse.json({ error: "Demo predictors can no longer be added — the tournament has started." }, { status: 403 });
  }

  try {
    await addMonkeyToGroup(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[monkey] addMonkeyToGroup failed:", e);
    return NextResponse.json({ error: "Failed to add Monkey" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const monkeyId = await ensureMonkeyUser();
    await removeDemoUserFromGroup(monkeyId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[monkey] removeDemoUserFromGroup failed:", e);
    return NextResponse.json({ error: "Failed to remove Monkey" }, { status: 500 });
  }
}
