import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const first = await prisma.groupMembership.findFirst({
    where: { userId: session.user.id, status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    select: { groupId: true },
  });

  if (first) redirect(`/groups/${first.groupId}`);

  // Admins without a membership can still see any group
  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN";
  if (isAdmin) {
    const anyGroup = await prisma.group.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (anyGroup) redirect(`/groups/${anyGroup.id}`);
  }

  redirect("/groups");
}
