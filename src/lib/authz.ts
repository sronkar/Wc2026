import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Group-scoped admin access check.
 *
 * - Global `ADMIN` → always allowed.
 * - Global `GROUP_ADMIN` → allowed only when they are an APPROVED member
 *   of the specific group. Previously any GROUP_ADMIN could modify/read any
 *   group (cross-tenant IDOR on /api/admin/groups/[id]/**).
 * - Everyone else → 403.
 * - Unauthenticated → 401.
 *
 * Returns a discriminated union so callers can early-return the error response
 * without dealing with nulls.
 */
export type GroupAccessResult =
  | { ok: true; session: Session; isGlobalAdmin: boolean }
  | { ok: false; status: 401 | 403; error: string };

export async function requireGroupAdminAccess(groupId: string): Promise<GroupAccessResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, status: 401, error: "Unauthorized" };

  const role = session.user.role;
  if (role === "ADMIN") return { ok: true, session, isGlobalAdmin: true };

  if (role === "GROUP_ADMIN") {
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: session.user.id, groupId } },
      select: { status: true },
    });
    if (membership?.status === "APPROVED") {
      return { ok: true, session, isGlobalAdmin: false };
    }
  }

  return { ok: false, status: 403, error: "Forbidden" };
}
