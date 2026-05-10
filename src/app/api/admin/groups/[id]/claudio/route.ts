import { NextRequest, NextResponse } from "next/server";
import { requireGroupAdminAccess } from "@/lib/authz";
import { addClaudioToGroup, ensureClaudioUser } from "@/lib/claudio";
import { removeDemoUserFromGroup } from "@/lib/monkey";
import { isDemoBotAddLocked } from "@/lib/demoBotLock";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (await isDemoBotAddLocked()) {
    return NextResponse.json({ error: "Demo predictors can no longer be added — the tournament has started." }, { status: 403 });
  }

  try {
    await addClaudioToGroup(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[claudio] addClaudioToGroup failed:", e);
    return NextResponse.json({ error: "Failed to add Claudio" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGroupAdminAccess(params.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const claudioId = await ensureClaudioUser();
    await removeDemoUserFromGroup(claudioId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[claudio] removeDemoUserFromGroup failed:", e);
    return NextResponse.json({ error: "Failed to remove Claudio" }, { status: 500 });
  }
}
