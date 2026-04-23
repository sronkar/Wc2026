import { NextResponse } from "next/server";
import { getNow, loadVirtualTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  await loadVirtualTime();
  return NextResponse.json({ now: getNow().toISOString() });
}
