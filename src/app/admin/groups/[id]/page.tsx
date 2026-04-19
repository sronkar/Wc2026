"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GroupAdminSection } from "@/components/dashboard/GroupAdminSection";

export default function AdminGroupPage() {
  const { data: session, status } = useSession();
  const { id: groupId } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const role = session?.user?.role;
    if (!session || (role !== "ADMIN" && role !== "SUB_ADMIN")) {
      router.replace("/");
    }
  }, [session, status, router]);

  if (status === "loading" || !session) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/admin"
        className="text-xs text-gray-400 hover:text-fifa-blue mb-6 inline-block"
      >
        ← Admin Panel
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Manage Group</h1>
      <p className="text-gray-400 text-sm mb-8">
        Members, invites, settings and predictions for this group.
      </p>
      <GroupAdminSection groupId={groupId} />
    </div>
  );
}
