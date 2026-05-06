import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getNow, loadVirtualTime } from "@/lib/time";

export const dynamic = "force-dynamic";

// Returns the current (possibly virtual) time. Gated behind a session because
// /api/time used to leak whether simulation mode was active to anonymous
// callers, which is a useful probe for an attacker trying to time a
// lock-bypass attempt during a virtual-time rewind.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await loadVirtualTime();
  return NextResponse.json({ now: getNow().toISOString() });
}
