import Image from "next/image";

interface Entry {
  id: string;
  rank: number;
  name: string;
  image: string | null;
  totalPoints: number;
  predictionsCount: number;
}

interface Props {
  entries: Entry[];
  currentUserId: string;
}

const medals = ["🥇", "🥈", "🥉"];

export function MiniLeaderboard({ entries, currentUserId }: Props) {
  const top3 = entries.slice(0, 3);
  const userEntry = entries.find((e) => e.id === currentUserId);
  const userInTop3 = userEntry ? userEntry.rank <= 3 : false;

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">No scores yet — be the first!</p>;
  }

  return (
    <div className="space-y-2">
      {top3.map((entry, i) => (
        <div
          key={entry.id}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
            entry.id === currentUserId ? "bg-yellow-50 ring-1 ring-yellow-200" : "bg-gray-50"
          }`}
        >
          <span className="text-xl w-8 text-center">{medals[i]}</span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {entry.image ? (
              <Image src={entry.image} alt={entry.name} width={28} height={28} className="rounded-full shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-fifa-blue text-white text-xs font-bold flex items-center justify-center shrink-0">
                {entry.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className={`text-sm font-medium truncate ${entry.id === currentUserId ? "text-gray-900" : "text-gray-700"}`}>
              {entry.id === currentUserId ? "You" : entry.name}
            </span>
          </div>
          <span className="font-bold text-fifa-blue tabular-nums">{entry.totalPoints}</span>
        </div>
      ))}

      {/* Show user's own rank if outside top 3 */}
      {!userInTop3 && userEntry && (
        <>
          <div className="flex items-center gap-2 px-3 py-1">
            <div className="flex-1 border-t border-dashed border-gray-200" />
            <span className="text-xs text-gray-400">your rank</span>
            <div className="flex-1 border-t border-dashed border-gray-200" />
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-yellow-50 ring-1 ring-yellow-200">
            <span className="text-sm font-bold text-gray-500 w-8 text-center">#{userEntry.rank}</span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {userEntry.image ? (
                <Image src={userEntry.image} alt="You" width={28} height={28} className="rounded-full shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-fifa-blue text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {userEntry.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-gray-900 truncate">You</span>
            </div>
            <span className="font-bold text-fifa-blue tabular-nums">{userEntry.totalPoints}</span>
          </div>
        </>
      )}
    </div>
  );
}
