import { prisma } from "@/lib/prisma";

/**
 * Append an entry to the admin audit log.
 *
 * Failures here MUST NOT block the action being audited — this is best-effort
 * observability, not a transactional guarantee. Wrap calls in `catch(() => {})`
 * or rely on the internal swallow.
 *
 * Snapshot fields (`before`/`after`) accept any JSON-serialisable value and
 * are stringified internally; pass `undefined` to omit.
 */
export async function logAdminAction(args: {
  actorUserId: string;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  context?: string;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: args.actorUserId,
        actorEmail: args.actorEmail ?? null,
        action: args.action,
        targetType: args.targetType ?? null,
        targetId: args.targetId ?? null,
        before: args.before === undefined ? null : JSON.stringify(args.before),
        after: args.after === undefined ? null : JSON.stringify(args.after),
        context: args.context ?? null,
      },
    });
  } catch (e) {
    // Swallow — audit log failures shouldn't break admin flows. Log to stderr
    // so the gap is at least visible in the server logs.
    console.error("[auditLog] write failed:", e);
  }
}
