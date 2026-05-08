import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PlatformInvitePage({ params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);

  // Not logged in — send to login, then come back here
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/platform-invite/${params.token}`);
  }

  const invite = await prisma.platformInvite.findUnique({ where: { token: params.token } });

  if (!invite) {
    return <ErrorPage message="This invite link is invalid." />;
  }
  if (invite.usedAt) {
    return <ErrorPage message="This invite has already been used." />;
  }
  if (invite.expiresAt < new Date()) {
    return <ErrorPage message="This invite has expired. Ask the admin to send a new one." />;
  }
  if (invite.email.toLowerCase() !== (session.user.email ?? "").toLowerCase()) {
    return <ErrorPage message={`This invite was sent to ${invite.email}. Please sign in with that address.`} />;
  }

  // Mark used and promote to GROUP_ADMIN
  await prisma.platformInvite.update({ where: { token: params.token }, data: { usedAt: new Date() } });
  await prisma.user.update({ where: { id: session.user.id }, data: { role: "GROUP_ADMIN" } });

  redirect("/groups?welcome=group-admin");
}

function ErrorPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-lg font-semibold text-gray-800">Invite not valid</h1>
        <p className="text-sm text-gray-500">{message}</p>
        <a href="/groups" className="btn-primary inline-block">Go to app</a>
      </div>
    </div>
  );
}
