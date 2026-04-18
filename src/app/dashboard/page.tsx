import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const predictions = await prisma.prediction.findMany({
    where: { userId: session.user.id },
    include: { match: true },
    orderBy: { match: { kickoff: "asc" } },
  });

  const totalPoints = predictions.reduce((s, p) => s + (p.points ?? 0), 0);
  const exactMatches = predictions.filter((p) => {
    const m = p.match;
    if (m.homeScore === null || m.awayScore === null) return false;
    return p.homeScore === m.homeScore && p.awayScore === m.awayScore;
  }).length;
  const directionOnly = predictions.filter((p) => {
    const m = p.match;
    if (m.homeScore === null || m.awayScore === null) return false;
    const same = p.homeScore === m.homeScore && p.awayScore === m.awayScore;
    if (same) return false;
    const pred = Math.sign(p.homeScore - p.awayScore);
    const actual = Math.sign(m.homeScore - m.awayScore);
    return pred === actual;
  }).length;
  const finishedPredictions = predictions.filter((p) => p.match.status === "FINISHED");

  const upcoming = predictions
    .filter((p) => p.match.status === "SCHEDULED")
    .slice(0, 5);

  const recent = finishedPredictions.slice(-5).reverse();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Welcome, {session.user.name?.split(" ")[0] ?? "Predictor"}!
      </h1>
      <p className="text-gray-400 text-sm mb-8">Your prediction dashboard</p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Points", value: totalPoints, color: "text-fifa-blue" },
          { label: "Predictions", value: predictions.length, color: "text-gray-700" },
          { label: "Exact Scores", value: exactMatches, color: "text-green-600" },
          { label: "Correct Result", value: directionOnly, color: "text-yellow-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card text-center">
            <div className={`text-3xl font-extrabold ${color}`}>{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent results */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center justify-between">
            Recent Results
            <Link href="/matches?filter=finished" className="text-xs text-fifa-blue font-normal hover:underline">
              View all
            </Link>
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400">No completed matches yet.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((p) => {
                const pts = p.points ?? 0;
                const ptsBadge = pts >= 5 ? "bg-green-100 text-green-800" : pts > 0 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-500";
                return (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{p.match.homeTeam}</span>
                      <span className="text-gray-400 mx-1">vs</span>
                      <span className="font-medium">{p.match.awayTeam}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400">
                        {p.homeScore}–{p.awayScore} / {p.match.homeScore}–{p.match.awayScore}
                      </span>
                      <span className={`badge ${ptsBadge}`}>{pts > 0 ? `+${pts}` : "0"}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Upcoming unpredicted */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-3 flex items-center justify-between">
            Upcoming Predictions
            <Link href="/matches" className="text-xs text-fifa-blue font-normal hover:underline">
              Predict all
            </Link>
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400">All caught up — no upcoming predictions.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{p.match.homeTeam}</span>
                    <span className="text-gray-400 mx-1">vs</span>
                    <span className="font-medium">{p.match.awayTeam}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(p.match.kickoff).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    &nbsp;· {p.homeScore}–{p.awayScore}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/matches" className="btn-primary">
          Make / Edit Predictions
        </Link>
      </div>
    </div>
  );
}
