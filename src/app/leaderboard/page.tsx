import Image from "next/image";

interface Entry {
  id: string;
  rank: number;
  name: string;
  image: string | null;
  totalPoints: number;
  predictionsCount: number;
}

async function getLeaderboard(): Promise<Entry[]> {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/leaderboard`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  const medalColors: Record<number, string> = {
    1: "text-yellow-500",
    2: "text-gray-400",
    3: "text-amber-600",
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Leaderboard</h1>
      <p className="text-gray-400 text-sm mb-8">Global rankings — updated after each match</p>

      {entries.length === 0 ? (
        <div className="card text-center text-gray-400 py-16">
          No predictions yet. Be the first!
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-fifa-blue text-white text-left">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3 text-right">Predictions</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.id}
                  className={`border-t border-gray-100 ${i === 0 ? "bg-yellow-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                >
                  <td className={`px-4 py-3 font-bold text-lg ${medalColors[entry.rank] ?? "text-gray-400"}`}>
                    {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {entry.image ? (
                        <Image
                          src={entry.image}
                          alt={entry.name}
                          width={28}
                          height={28}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-fifa-blue text-white flex items-center justify-center text-xs font-bold">
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-gray-800">{entry.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{entry.predictionsCount}</td>
                  <td className="px-4 py-3 text-right font-bold text-fifa-blue">{entry.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
