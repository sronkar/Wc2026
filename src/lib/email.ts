import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

interface UpcomingMatch {
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  city: string;
}

export async function sendReminderEmail(
  to: string,
  name: string,
  matches: UpcomingMatch[]
) {
  const rows = matches
    .map(
      (m) =>
        `<tr>
          <td style="padding:8px 12px;font-weight:bold">${m.homeTeam} vs ${m.awayTeam}</td>
          <td style="padding:8px 12px;color:#666">${m.city}</td>
          <td style="padding:8px 12px;color:#666">${m.kickoff.toUTCString()}</td>
        </tr>`
    )
    .join("");

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "⚽ 2 hours left — make your predictions!",
    html: `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto">
        <div style="background:#003366;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">⚽ WC2026 Predictions</h1>
        </div>
        <div style="padding:24px">
          <p>Hi <strong>${name}</strong>,</p>
          <p>The following match${matches.length > 1 ? "es are" : " is"} starting in about 2 hours and you haven't predicted yet:</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#f8f9fa">
                <th style="padding:8px 12px;text-align:left">Match</th>
                <th style="padding:8px 12px;text-align:left">Venue</th>
                <th style="padding:8px 12px;text-align:left">Kickoff (UTC)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:20px">Predictions <strong>lock 1 hour before kickoff</strong> — don't miss out!</p>
          <a href="${process.env.NEXTAUTH_URL}/matches"
             style="display:inline-block;margin-top:8px;background:#C9A84C;color:#000;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
            Predict Now →
          </a>
        </div>
        <div style="background:#f8f9fa;padding:12px;text-align:center;color:#999;font-size:12px">
          WC2026 Predictions · Not affiliated with FIFA
        </div>
      </div>
    `,
  });
}

interface PostGameInsight {
  emoji: string;
  text: string;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  totalPoints: number;
  pointsGained?: number;
}

export async function sendPostGameEmail(
  to: string,
  name: string,
  match: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number },
  insights: PostGameInsight[],
  top3: LeaderboardEntry[],
  userEntry?: LeaderboardEntry
) {
  const insightRows = insights
    .map((i) => `<li style="margin:6px 0">${i.emoji} ${i.text}</li>`)
    .join("");

  const medals = ["🥇", "🥈", "🥉"];
  const leaderRows = top3
    .map(
      (e, i) =>
        `<tr style="${e.rank === userEntry?.rank ? "background:#fffde7" : ""}">
          <td style="padding:8px 12px">${medals[i]}</td>
          <td style="padding:8px 12px;font-weight:bold">${e.name}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:bold;color:#003366">${e.totalPoints} pts</td>
          <td style="padding:8px 12px;text-align:right;color:#22c55e">${e.pointsGained ? `+${e.pointsGained}` : ""}</td>
        </tr>`
    )
    .join("");

  const userRow =
    userEntry && userEntry.rank > 3
      ? `<tr style="background:#fffde7;border-top:2px dashed #eee">
          <td style="padding:8px 12px;color:#666">#${userEntry.rank}</td>
          <td style="padding:8px 12px;font-weight:bold">You</td>
          <td style="padding:8px 12px;text-align:right;font-weight:bold;color:#003366">${userEntry.totalPoints} pts</td>
          <td style="padding:8px 12px;text-align:right;color:#22c55e">${userEntry.pointsGained ? `+${userEntry.pointsGained}` : ""}</td>
        </tr>`
      : "";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `⚽ Result: ${match.homeTeam} ${match.homeScore}–${match.awayScore} ${match.awayTeam}`,
    html: `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto">
        <div style="background:#003366;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">⚽ Match Result</h1>
        </div>
        <div style="padding:24px">
          <div style="text-align:center;margin-bottom:24px">
            <p style="font-size:28px;font-weight:900;color:#003366;margin:0">
              ${match.homeTeam} <span style="color:#C9A84C">${match.homeScore} – ${match.awayScore}</span> ${match.awayTeam}
            </p>
          </div>
          <h3 style="color:#003366">Prediction Insights</h3>
          <ul style="list-style:none;padding:0;background:#f8f9fa;border-radius:8px;padding:16px">${insightRows}</ul>
          <h3 style="color:#003366">Leaderboard</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#003366;color:#fff">
                <th style="padding:8px 12px;text-align:left"></th>
                <th style="padding:8px 12px;text-align:left">Player</th>
                <th style="padding:8px 12px;text-align:right">Total</th>
                <th style="padding:8px 12px;text-align:right">This match</th>
              </tr>
            </thead>
            <tbody>${leaderRows}${userRow}</tbody>
          </table>
          <div style="margin-top:20px;text-align:center">
            <a href="${process.env.NEXTAUTH_URL}/leaderboard"
               style="display:inline-block;background:#003366;color:#fff;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
              Full Leaderboard →
            </a>
          </div>
        </div>
        <div style="background:#f8f9fa;padding:12px;text-align:center;color:#999;font-size:12px">
          WC2026 Predictions · Not affiliated with FIFA
        </div>
      </div>
    `,
  });
}
