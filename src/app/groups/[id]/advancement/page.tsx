import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdvancementPicksClient } from "./AdvancementPicksClient";
import { WC_GROUPS, ADVANCEMENT_LOCK_TIME } from "@/lib/wcGroups";
import { getNow } from "@/lib/time";
export const revalidate = 0;

export default async function AdvancementPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const groupId = params.id;
  const userId = session.user.id;
  const role = session.user.role;
  const isAdminRole = role === "ADMIN" || role === "SUB_ADMIN";

  const [group, membership] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    }),
  ]);

  if (!group) redirect("/groups");
  if (!isAdminRole && membership?.status !== "APPROVED") redirect("/groups");

  const isVisitor = membership?.memberRole === "VISITOR_ADMIN";

  // Load user's existing picks
  const existingPicks = await prisma.advancementPrediction.findMany({
    where: { userId, groupId },
  });
  const picksMap: Record<string, { pick: string; points: number | null }> = {};
  for (const p of existingPicks) {
    picksMap[p.team] = { pick: p.pick, points: p.points };
  }

  // Load admin resolutions
  const resolutions = await prisma.teamAdvancement.findMany();
  const resolvedMap: Record<string, string> = {};
  for (const r of resolutions) resolvedMap[r.team] = r.result;

  const isLocked = getNow() >= ADVANCEMENT_LOCK_TIME;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Group Stage Picks</h1>
        <p className="text-sm text-gray-500 mt-1">
          Predict how each of the 48 teams will finish the group stage.
          {!isLocked && (
            <span className="ml-1">
              Locks{" "}
              {ADVANCEMENT_LOCK_TIME.toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                timeZone: "UTC", timeZoneName: "short",
              })}.
            </span>
          )}
        </p>

        {isLocked && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium">
            <span>🔒</span>
            <span>Picks are locked — the tournament has started. Results are shown below.</span>
          </div>
        )}

        {!isLocked && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />
              Per group: 1 winner · 1 runner-up · max 1 third-place
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
              Max 8 "advance as 3rd" across all groups
            </span>
          </div>
        )}
      </div>

      <AdvancementPicksClient
        groupId={groupId}
        wcGroups={WC_GROUPS}
        initialPicks={picksMap}
        resolvedMap={resolvedMap}
        isLocked={isLocked}
        isVisitor={isVisitor}
      />
    </div>
  );
}
