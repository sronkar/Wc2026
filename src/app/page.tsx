import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getServerSession(authOptions);

  // Signed-in users go straight to their group dashboard
  if (session?.user?.id) {
    const first = await prisma.groupMembership.findFirst({
      where: { userId: session.user.id, status: "APPROVED" },
      orderBy: { createdAt: "asc" },
      select: { groupId: true },
    });
    if (first) redirect(`/groups/${first.groupId}`);

    const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN";
    if (isAdmin) {
      const anyGroup = await prisma.group.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
      if (anyGroup) redirect(`/groups/${anyGroup.id}`);
    }
    redirect("/groups");
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="bg-fifa-blue text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-4 tracking-tight">
            FIFA World Cup 2026
          </h1>
          <p className="text-xl md:text-2xl text-blue-200 mb-2 font-medium">
            Prediction Challenge
          </p>
          <p className="text-blue-300 mb-8 max-w-xl mx-auto">
            Predict match results, earn points, and climb the leaderboard.
            USA · Canada · Mexico — June 11 to July 26, 2026.
          </p>
          <Link href="/login" className="bg-fifa-gold text-gray-900 px-10 py-4 rounded-lg font-bold text-lg hover:brightness-110 transition inline-block">
            Join the Challenge
          </Link>
        </div>
      </section>


      {/* How it works */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: "🔐",
                title: "Sign In",
                desc: "Log in with your Google account or email address.",
              },
              {
                icon: "🎯",
                title: "Predict",
                desc: "Submit your score predictions for every match. Predictions lock 1 hour before kickoff.",
              },
              {
                icon: "🏆",
                title: "Score Points",
                desc: "Exact score = 5 pts · Correct winner/draw = 1 pt. Climb the leaderboard!",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="card text-center">
                <div className="text-4xl mb-3">{icon}</div>
                <h3 className="font-bold text-lg mb-2 text-gray-800">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* CTA */}
      {!session && (
        <section className="py-16 px-4 bg-fifa-blue text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to compete?</h2>
          <p className="text-blue-200 mb-6">Sign in and start predicting before the tournament begins.</p>
          <Link href="/login" className="bg-fifa-gold text-gray-900 px-10 py-3 rounded-lg font-bold hover:brightness-110 transition inline-block">
            Get Started
          </Link>
        </section>
      )}

      <footer className="bg-gray-800 text-gray-400 text-center py-6 text-sm">
        WC2026 Predictions · Not affiliated with FIFA
      </footer>
    </div>
  );
}
