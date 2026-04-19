import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function LeaderboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const first = await prisma.groupMembership.findFirst({
    where: { userId: session.user.id, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: { groupId: true },
  });

  if (first) redirect(`/groups/${first.groupId}/leaderboard`);
  redirect("/groups");
}
