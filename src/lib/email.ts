import nodemailer from "nodemailer";

const port = Number(process.env.EMAIL_SERVER_PORT ?? 587);
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port,
  // Port 465 uses implicit SSL; everything else uses STARTTLS.
  secure: port === 465,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
  // Fail fast instead of hanging when SMTP is unreachable / misconfigured.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

// If RESEND_API_KEY is set, send via Resend's HTTP API instead of SMTP.
// Cloud hosts (Railway, Fly, etc.) often block outbound SMTP entirely;
// HTTPS to api.resend.com works everywhere.
async function sendViaResend({ to, subject, html }: { to: string; subject: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body}`);
  }
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend({ to, subject, html });
    } else {
      await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html, encoding: "utf-8" });
    }
  } catch (e) {
    console.error("[email] sendMail failed:", { to, subject, error: e });
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────────────────────────────────────

const HEADER = (subtitle: string) => `
  <div style="background:#003366;padding:32px 24px;text-align:center">
    <div style="font-size:36px;margin-bottom:8px">⚽</div>
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:900;letter-spacing:-0.5px">SoccerPicks WC 2026</h1>
    <p style="color:#C9A84C;margin:6px 0 0;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase">${subtitle}</p>
  </div>`;

const FOOTER = `
  <div style="background:#f8f9fa;border-top:1px solid #e5e7eb;padding:16px 24px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9ca3af">SoccerPicks WC 2026 · Not affiliated with FIFA</p>
  </div>`;

const WRAP = (inner: string, maxWidth = 540) =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f4f6"><div style="font-family:sans-serif;max-width:${maxWidth}px;margin:0 auto;background:#fff">${inner}</div></body></html>`;

const CTA = (href: string, label: string, bg = "#003366") =>
  `<div style="text-align:center;margin-bottom:28px">
    <a href="${href}" style="display:inline-block;background:${bg};color:#fff;padding:16px 36px;border-radius:10px;font-weight:700;font-size:16px;text-decoration:none;letter-spacing:0.3px">${label}</a>
  </div>`;

const MANUAL_LINK = (url: string) =>
  `<p style="font-size:12px;color:#999;margin:0 0 4px">Or copy this link into your browser:</p>
   <p style="font-size:11px;color:#6b7280;word-break:break-all;background:#f3f4f6;border-radius:6px;padding:8px 12px;margin:0">${url}</p>`;

// ─────────────────────────────────────────────────────────────────────────────
// Magic link
// ─────────────────────────────────────────────────────────────────────────────

export function buildMagicLinkHtml(url: string): string {
  return WRAP(`
    ${HEADER("Sign In")}
    <div style="padding:32px 24px">
      <p style="color:#555;margin:0 0 20px">
        Click the button below to sign in to SoccerPicks WC 2026.
        This link expires in <strong>24 hours</strong> and can only be used once.
      </p>
      ${CTA(url, "Sign In to SoccerPicks →")}
      ${MANUAL_LINK(url)}
      <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">If you didn't request this, you can safely ignore it.</p>
    </div>
    ${FOOTER}
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Group invite
// ─────────────────────────────────────────────────────────────────────────────

interface GroupInviteParams {
  groupName: string;
  roleLabel: string;
  inviteUrl: string;
  requirePassword: boolean;
  inviterName?: string;
}

export function buildGroupInviteHtml({ groupName, roleLabel, inviteUrl, requirePassword, inviterName }: GroupInviteParams): string {
  const joinNote = requirePassword
    ? "You will set a password to secure your account when you join."
    : "No password required — just enter your name and you're in.";
  const inviterLine = inviterName
    ? `<p style="color:#555;margin:0 0 20px"><strong>${inviterName}</strong> has invited you to join a SoccerPicks WC 2026 prediction group.</p>`
    : `<p style="color:#555;margin:0 0 20px">You've been invited to join a SoccerPicks WC 2026 prediction group.</p>`;

  return WRAP(`
    ${HEADER("Group Invite")}
    <div style="padding:32px 24px">
      ${inviterLine}
      <div style="background:#f8f9fa;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:600">Group</p>
        <p style="margin:0${roleLabel !== "Member" ? " 0 12px" : ""};font-size:22px;font-weight:900;color:#003366">${groupName}</p>
        ${roleLabel !== "Member" ? `<p style="margin:0;font-size:13px;color:#555">Your role: <strong style="color:#003366">${roleLabel}</strong></p>` : ""}
      </div>
      <p style="font-size:13px;color:#666;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:28px">
        ℹ️ ${joinNote}
      </p>
      ${CTA(inviteUrl, "Accept Invitation →")}
      ${MANUAL_LINK(inviteUrl)}
    </div>
    <div style="background:#f8f9fa;border-top:1px solid #e5e7eb;padding:16px 24px;text-align:center">
      <p style="margin:0;font-size:11px;color:#9ca3af">This invite expires in 7 days. If you didn't expect this, you can safely ignore it.</p>
      <p style="margin:6px 0 0;font-size:11px;color:#d1d5db">SoccerPicks WC 2026 · Not affiliated with FIFA</p>
    </div>
  `);
}

export async function sendGroupInviteEmail({ to, ...rest }: { to: string } & GroupInviteParams): Promise<void> {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `You're invited to join "${rest.groupName}" on SoccerPicks WC 2026`,
    html: buildGroupInviteHtml(rest),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome email
// ─────────────────────────────────────────────────────────────────────────────

interface WelcomeParams {
  name: string;
  groupName: string;
  groupId: string;
}

export function buildWelcomeHtml({ name, groupName, groupId }: WelcomeParams): string {
  const groupUrl = `${process.env.NEXTAUTH_URL}/groups/${groupId}`;
  return WRAP(`
    ${HEADER("You're In! 🎉")}
    <div style="padding:32px 24px">
      <p style="color:#555;margin:0 0 16px">Hi <strong>${name}</strong>,</p>
      <p style="color:#555;margin:0 0 20px">
        You've joined <strong style="color:#003366">${groupName}</strong> on SoccerPicks WC 2026.
        Start predicting match scores before kickoff — earn points for correct results and bonus points for exact scores.
      </p>
      ${CTA(groupUrl, "Go to Your Group →")}
      <p style="font-size:12px;color:#9ca3af;margin:0">Predictions lock 1 hour before each match kicks off. Don't miss out!</p>
    </div>
    ${FOOTER}
  `);
}

export async function sendWelcomeEmail({ to, ...rest }: { to: string } & WelcomeParams): Promise<void> {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Welcome to "${rest.groupName}" — SoccerPicks WC 2026 🎉`,
    html: buildWelcomeHtml(rest),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Password reset
// ─────────────────────────────────────────────────────────────────────────────

interface PasswordResetParams {
  name: string;
  resetUrl: string;
}

export function buildPasswordResetHtml({ name, resetUrl }: PasswordResetParams): string {
  return WRAP(`
    ${HEADER("Password Reset")}
    <div style="padding:32px 24px">
      <p style="color:#555;margin:0 0 16px">Hi <strong>${name}</strong>,</p>
      <p style="color:#555;margin:0 0 20px">
        We received a request to reset your SoccerPicks WC 2026 password.
        Click below to set a new one. This link expires in <strong>1 hour</strong>.
      </p>
      ${CTA(resetUrl, "Reset Password →")}
      ${MANUAL_LINK(resetUrl)}
      <p style="font-size:12px;color:#9ca3af;margin:20px 0 0">If you didn't request this, you can safely ignore this email.</p>
    </div>
    ${FOOTER}
  `);
}

export async function sendPasswordResetEmail({ to, ...rest }: { to: string } & PasswordResetParams): Promise<void> {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Reset your SoccerPicks WC 2026 password",
    html: buildPasswordResetHtml(rest),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Join-link verification notice
// ─────────────────────────────────────────────────────────────────────────────

interface JoinVerificationParams {
  name: string;
  groupName: string;
}

export function buildJoinLinkVerificationHtml({ name, groupName }: JoinVerificationParams): string {
  return WRAP(`
    ${HEADER("Email Verification")}
    <div style="padding:32px 24px">
      <p style="color:#555;margin:0 0 16px">Hi <strong>${name}</strong>,</p>
      <p style="color:#555;margin:0 0 16px">
        You've joined <strong style="color:#003366">${groupName}</strong> via a shared link —
        great to have you! One quick note: since you joined through a link rather than a
        personal email invite, your email address hasn't been formally verified yet.
      </p>
      <p style="color:#555;margin:0 0 20px">
        You can verify it any time by signing in with the <strong>magic link</strong> option on the login page.
      </p>
      <p style="font-size:12px;color:#9ca3af;margin:0">
        If you didn't join this group, please contact us and we'll remove your account.
      </p>
    </div>
    ${FOOTER}
  `);
}

export async function sendJoinLinkVerificationEmail({ to, ...rest }: { to: string } & JoinVerificationParams): Promise<void> {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `You've joined "${rest.groupName}" — please verify your email`,
    html: buildJoinLinkVerificationHtml(rest),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Match reminder (1h before lock)
// ─────────────────────────────────────────────────────────────────────────────

interface UpcomingMatch {
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  city: string;
}

export function buildReminderHtml(name: string, matches: UpcomingMatch[]): string {
  const rows = matches
    .map((m) => `<tr>
      <td style="padding:8px 12px;font-weight:bold">${m.homeTeam} vs ${m.awayTeam}</td>
      <td style="padding:8px 12px;color:#666">${m.city}</td>
      <td style="padding:8px 12px;color:#666">${m.kickoff.toUTCString()}</td>
    </tr>`)
    .join("");

  return WRAP(`
    <div style="background:#003366;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">⚽ SoccerPicks WC 2026</h1>
    </div>
    <div style="padding:24px">
      <p>Hi <strong>${name}</strong>,</p>
      <p>Predictions lock in about <strong>1 hour</strong> and you haven't predicted the following match${matches.length > 1 ? "es" : ""} yet:</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f8f9fa">
          <th style="padding:8px 12px;text-align:left">Match</th>
          <th style="padding:8px 12px;text-align:left">Venue</th>
          <th style="padding:8px 12px;text-align:left">Kickoff (UTC)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:20px">Predictions <strong>lock 1 hour before kickoff</strong> — don't miss out!</p>
      <a href="${process.env.NEXTAUTH_URL}/groups"
         style="display:inline-block;margin-top:8px;background:#C9A84C;color:#000;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
        Predict Now →
      </a>
    </div>
    <div style="background:#f8f9fa;padding:12px;text-align:center;color:#999;font-size:12px">
      SoccerPicks WC 2026 · Not affiliated with FIFA
    </div>
  `);
}

export async function sendReminderEmail(to: string, name: string, matches: UpcomingMatch[]): Promise<void> {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `⚽ ~1 hour to lock — predict now! (${matches.map((m) => `${m.homeTeam} vs ${m.awayTeam}`).join(", ")})`,
    html: buildReminderHtml(name, matches),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lock 30-minute warning
// ─────────────────────────────────────────────────────────────────────────────

export function buildLock30mHtml(name: string, matches: UpcomingMatch[]): string {
  const rows = matches
    .map((m) => `<tr>
      <td style="padding:8px 12px;font-weight:bold">${m.homeTeam} vs ${m.awayTeam}</td>
      <td style="padding:8px 12px;color:#666">${m.city}</td>
      <td style="padding:8px 12px;color:#666">${m.kickoff.toUTCString()}</td>
    </tr>`)
    .join("");

  return WRAP(`
    <div style="background:#003366;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">⚽ SoccerPicks WC 2026</h1>
    </div>
    <div style="padding:24px">
      <p>Hi <strong>${name}</strong>,</p>
      <p style="color:#ea580c;font-weight:600">⚡ Last chance — predictions lock in 30 minutes!</p>
      <p>You haven't predicted the following match${matches.length > 1 ? "es" : ""} yet:</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f8f9fa">
          <th style="padding:8px 12px;text-align:left">Match</th>
          <th style="padding:8px 12px;text-align:left">Venue</th>
          <th style="padding:8px 12px;text-align:left">Kickoff (UTC)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:20px">Predictions <strong>lock 1 hour before kickoff</strong> — you have ~30 min left!</p>
      <a href="${process.env.NEXTAUTH_URL}/groups"
         style="display:inline-block;margin-top:8px;background:#ea580c;color:#fff;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
        Predict Now →
      </a>
    </div>
    <div style="background:#f8f9fa;padding:12px;text-align:center;color:#999;font-size:12px">
      SoccerPicks WC 2026 · Not affiliated with FIFA
    </div>
  `);
}

export async function sendLock30mEmail(to: string, name: string, matches: UpcomingMatch[]): Promise<void> {
  const matchList = matches.map((m) => `${m.homeTeam} vs ${m.awayTeam}`).join(", ");
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `⚡ 30 min to lock — predict now! (${matchList})`,
    html: buildLock30mHtml(name, matches),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Group Admin action alert
// ─────────────────────────────────────────────────────────────────────────────

export interface SubAdminActionDetails {
  matchHomeTeam: string;
  matchAwayTeam: string;
  matchNumber: number;
  newHomeScore: number;
  newAwayScore: number;
  prevHomeScore?: number | null;
  prevAwayScore?: number | null;
  targetUserName?: string;
}

export function buildSubAdminActionHtml(
  actorName: string,
  action: "score_update" | "prediction_update",
  details: SubAdminActionDetails
): string {
  const isScore = action === "score_update";
  const body = isScore
    ? `<strong>${actorName}</strong> updated the score for Match #${details.matchNumber}
       <strong>${details.matchHomeTeam} vs ${details.matchAwayTeam}</strong>.<br><br>
       Previous: ${details.prevHomeScore ?? "?"} – ${details.prevAwayScore ?? "?"}<br>
       New: <strong>${details.newHomeScore} – ${details.newAwayScore}</strong>`
    : `<strong>${actorName}</strong> edited the prediction for
       <strong>${details.targetUserName}</strong> on Match #${details.matchNumber}
       <strong>${details.matchHomeTeam} vs ${details.matchAwayTeam}</strong>.<br><br>
       New prediction: <strong>${details.newHomeScore} – ${details.newAwayScore}</strong>`;

  return WRAP(`
    <div style="background:#003366;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">⚽ SoccerPicks WC 2026 — Group Admin Action</h1>
    </div>
    <div style="padding:24px">
      <p>${body}</p>
      <a href="${process.env.NEXTAUTH_URL}/admin"
         style="display:inline-block;margin-top:16px;background:#003366;color:#fff;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
        Open Admin Panel →
      </a>
    </div>
    <div style="background:#f8f9fa;padding:12px;text-align:center;color:#999;font-size:12px">
      SoccerPicks WC 2026 · Group Admin activity log
    </div>
  `);
}

export async function sendSubAdminActionEmail(
  adminEmail: string,
  actorName: string,
  action: "score_update" | "prediction_update",
  details: SubAdminActionDetails
): Promise<void> {
  const isScore = action === "score_update";
  const subject = isScore
    ? `[Group Admin] Score updated: ${details.matchHomeTeam} vs ${details.matchAwayTeam}`
    : `[Group Admin] Prediction edited: ${details.targetUserName} — ${details.matchHomeTeam} vs ${details.matchAwayTeam}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: adminEmail,
    subject,
    html: buildSubAdminActionHtml(actorName, action, details),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform invite — lets recipient create their own group
// ─────────────────────────────────────────────────────────────────────────────

export async function sendPlatformInviteEmail(to: string, inviteUrl: string): Promise<void> {
  const html = WRAP(`
    <div style="background:#003366;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">⚽ You're invited to SoccerPicks WC 2026</h1>
    </div>
    <div style="padding:24px">
      <p>You've been invited to create your own SoccerPicks WC 2026 group.</p>
      <p>Click below to accept — you'll be able to set up your group, invite friends, and compete on predictions for the 2026 World Cup.</p>
      <a href="${inviteUrl}"
         style="display:inline-block;margin-top:16px;background:#003366;color:#fff;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
        Accept Invite &amp; Create Group →
      </a>
      <p style="margin-top:24px;color:#666;font-size:13px">This invite expires in 7 days. If you didn't expect this email, you can ignore it.</p>
    </div>
    <div style="background:#f8f9fa;padding:12px;text-align:center;color:#999;font-size:12px">
      SoccerPicks WC 2026
    </div>
  `);
  await sendEmail({ to, subject: "You're invited to create a SoccerPicks WC 2026 group", html });
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-game result email
// ─────────────────────────────────────────────────────────────────────────────

export interface PredRow {
  name: string;
  predHomeScore: number | null;
  predAwayScore: number | null;
  points: number;
  isExact: boolean;
  isDirection: boolean;
  hasPrediction: boolean;
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

interface PostGameParams {
  match: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };
  insights: PostGameInsight[];
  top3: LeaderboardEntry[];
  predRows: PredRow[];
  userEntry?: LeaderboardEntry;
}

export function buildPostGameHtml({ match, insights, top3, predRows, userEntry }: PostGameParams): string {
  const insightRows = insights.map((i) => `<li style="margin:6px 0">${i.emoji} ${i.text}</li>`).join("");
  const medals = ["🥇", "🥈", "🥉"];

  const leaderRows = top3
    .map((e, i) => `<tr style="${e.rank === userEntry?.rank ? "background:#fffde7" : ""}">
      <td style="padding:8px 12px">${medals[i]}</td>
      <td style="padding:8px 12px;font-weight:bold">${e.name}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:bold;color:#003366">${e.totalPoints} pts</td>
      <td style="padding:8px 12px;text-align:right;color:#22c55e">${e.pointsGained ? `+${e.pointsGained}` : ""}</td>
    </tr>`)
    .join("");

  const userRow = userEntry && userEntry.rank > 3
    ? `<tr>
        <td colspan="4" style="padding:4px 12px;text-align:center;color:#9ca3af;font-size:13px;letter-spacing:2px">· · ·</td>
      </tr>
      <tr style="background:#fffde7">
        <td style="padding:8px 12px;color:#666;font-weight:bold">#${userEntry.rank}</td>
        <td style="padding:8px 12px;font-weight:bold">You</td>
        <td style="padding:8px 12px;text-align:right;font-weight:bold;color:#003366">${userEntry.totalPoints} pts</td>
        <td style="padding:8px 12px;text-align:right;color:#22c55e">${userEntry.pointsGained ? `+${userEntry.pointsGained}` : ""}</td>
      </tr>`
    : "";

  const predTableRows = predRows.map((row) => {
    let rowBg = "";
    let nameStyle = "color:#6b7280";
    let predStyle = "color:#9ca3af";
    let ptsStyle = "color:#9ca3af";
    let resultLabel = "—";
    let predStr = "No pick";
    let ptsStr = "—";
    if (row.hasPrediction) {
      predStr = `${row.predHomeScore}–${row.predAwayScore}`;
      ptsStr = row.points > 0 ? `+${row.points}` : "0";
      if (row.isExact) {
        rowBg = "background:#f0fdf4"; nameStyle = "color:#15803d;font-weight:bold";
        predStyle = "color:#15803d;font-weight:bold"; ptsStyle = "color:#15803d;font-weight:bold"; resultLabel = "✓ Exact";
      } else if (row.isDirection) {
        rowBg = "background:#f7fef7"; nameStyle = "color:#16a34a";
        predStyle = "color:#16a34a"; ptsStyle = "color:#16a34a"; resultLabel = "✓ Right";
      } else {
        rowBg = "background:#fff5f5"; nameStyle = "color:#dc2626";
        predStyle = "color:#dc2626"; ptsStyle = "color:#dc2626"; resultLabel = "✗ Miss";
      }
    }
    return `<tr style="${rowBg}">
      <td style="padding:7px 12px;font-size:12px;${nameStyle}">${row.name}</td>
      <td style="padding:7px 12px;text-align:center;font-size:12px;${predStyle}">${predStr}</td>
      <td style="padding:7px 12px;text-align:center;font-size:11px;${ptsStyle}">${resultLabel}</td>
      <td style="padding:7px 12px;text-align:right;font-size:12px;font-weight:bold;${ptsStyle}">${ptsStr}</td>
    </tr>`;
  }).join("");

  const predTableSection = predRows.length > 0 ? `
    <h3 style="color:#003366;margin:24px 0 10px">Everyone's Predictions</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-family:sans-serif">
      <thead><tr style="background:#f8f9fa">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Player</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Pick</th>
        <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Result</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Pts</th>
      </tr></thead>
      <tbody>${predTableRows}</tbody>
    </table>` : "";

  return WRAP(`
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
      <ul style="list-style:none;padding:16px;background:#f8f9fa;border-radius:8px;margin:0 0 16px">${insightRows}</ul>
      <h3 style="color:#003366">Leaderboard</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#003366;color:#fff">
          <th style="padding:8px 12px;text-align:left"></th>
          <th style="padding:8px 12px;text-align:left">Player</th>
          <th style="padding:8px 12px;text-align:right">Total</th>
          <th style="padding:8px 12px;text-align:right">This match</th>
        </tr></thead>
        <tbody>${leaderRows}${userRow}</tbody>
      </table>
      ${predTableSection}
      <div style="margin-top:24px;text-align:center">
        <a href="${process.env.NEXTAUTH_URL}/groups"
           style="display:inline-block;background:#003366;color:#fff;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none">
          View Leaderboard →
        </a>
      </div>
    </div>
    <div style="background:#f8f9fa;padding:12px;text-align:center;color:#999;font-size:12px">
      SoccerPicks WC 2026 · Not affiliated with FIFA
    </div>
  `, 560);
}

export async function sendPostGameEmail(
  to: string,
  name: string,
  match: PostGameParams["match"],
  insights: PostGameInsight[],
  top3: LeaderboardEntry[],
  predRows: PredRow[],
  userEntry?: LeaderboardEntry
): Promise<void> {
  // name param kept for API compat (personalisation could be added later)
  void name;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `⚽ Result: ${match.homeTeam} ${match.homeScore}–${match.awayScore} ${match.awayTeam}`,
    html: buildPostGameHtml({ match, insights, top3, predRows, userEntry }),
  });
}
