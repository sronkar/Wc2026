import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cleanupStaleNotifications } from "@/lib/cleanup";

// Manual trigger for the daily notification/reminder cleanup. Useful for
// ad-hoc pruning and for integration tests.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await cleanupStaleNotifications();
  return NextResponse.json(result);
}
