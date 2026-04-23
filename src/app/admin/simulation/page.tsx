import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SimulationPanel } from "./SimulationPanel";

export default async function SimulationPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") redirect("/groups");
  return <SimulationPanel />;
}
