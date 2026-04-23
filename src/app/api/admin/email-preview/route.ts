import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildMagicLinkHtml,
  buildGroupInviteHtml,
  buildWelcomeHtml,
  buildPasswordResetHtml,
  buildJoinLinkVerificationHtml,
  buildReminderHtml,
  buildLock30mHtml,
  buildPostGameHtml,
  buildSubAdminActionHtml,
  sendEmail,
} from "@/lib/email";

const TEMPLATES = [
  "magic",
  "invite",
  "welcome",
  "reset",
  "verification",
  "reminder",
  "lock30m",
  "postgame",
  "subadmin",
] as const;
type Template = (typeof TEMPLATES)[number];

function buildPreviewHtml(template: Template): string {
  const appUrl = process.env.NEXTAUTH_URL ?? "https://wc2026.app";

  switch (template) {
    case "magic":
      return buildMagicLinkHtml(`${appUrl}/api/auth/callback/email?token=preview-token-abc123`);

    case "invite":
      return buildGroupInviteHtml({
        groupName: "World Cup Legends 2026",
        roleLabel: "Member",
        inviteUrl: `${appUrl}/invite/preview-token-abc123`,
        requirePassword: false,
        inviterName: "Jamie (Admin)",
      });

    case "welcome":
      return buildWelcomeHtml({
        name: "Alex",
        groupName: "World Cup Legends 2026",
        groupId: "preview-group-id",
      });

    case "reset":
      return buildPasswordResetHtml({
        name: "Alex",
        resetUrl: `${appUrl}/reset-password/preview-reset-token`,
      });

    case "verification":
      return buildJoinLinkVerificationHtml({
        name: "Alex",
        groupName: "World Cup Legends 2026",
      });

    case "reminder":
      return buildReminderHtml("Alex", [
        { homeTeam: "Brazil", awayTeam: "Argentina", kickoff: new Date(Date.now() + 3_600_000), city: "New York" },
        { homeTeam: "France", awayTeam: "Germany", kickoff: new Date(Date.now() + 3_720_000), city: "Los Angeles" },
      ]);

    case "lock30m":
      return buildLock30mHtml("Alex", [
        { homeTeam: "England", awayTeam: "Spain", kickoff: new Date(Date.now() + 1_800_000), city: "Miami" },
      ]);

    case "postgame":
      return buildPostGameHtml({
        match: { homeTeam: "Brazil", awayTeam: "Argentina", homeScore: 2, awayScore: 1 },
        insights: [
          { emoji: "🎯", text: "Alex was the only one to get the exact score!" },
          { emoji: "✅", text: "4 out of 8 players predicted Brazil to win." },
          { emoji: "🔥", text: "Drew is on a 3-match correct streak!" },
        ],
        top3: [
          { rank: 1, name: "Alex", totalPoints: 142, pointsGained: 5 },
          { rank: 2, name: "Drew", totalPoints: 138, pointsGained: 2 },
          { rank: 3, name: "Riley", totalPoints: 130, pointsGained: 2 },
        ],
        predRows: [
          { name: "Alex", predHomeScore: 2, predAwayScore: 1, points: 5, isExact: true, isDirection: true, hasPrediction: true },
          { name: "Drew", predHomeScore: 1, predAwayScore: 0, points: 2, isExact: false, isDirection: true, hasPrediction: true },
          { name: "Riley", predHomeScore: 1, predAwayScore: 0, points: 2, isExact: false, isDirection: true, hasPrediction: true },
          { name: "Maya", predHomeScore: 0, predAwayScore: 1, points: 0, isExact: false, isDirection: false, hasPrediction: true },
          { name: "Jordan", predHomeScore: 0, predAwayScore: 0, points: 0, isExact: false, isDirection: false, hasPrediction: false },
        ],
        userEntry: { rank: 1, name: "Alex", totalPoints: 142, pointsGained: 5 },
      });

    case "subadmin":
      return buildSubAdminActionHtml("Jamie", "score_update", {
        matchHomeTeam: "Brazil",
        matchAwayTeam: "Argentina",
        matchNumber: 42,
        newHomeScore: 2,
        newAwayScore: 1,
        prevHomeScore: 1,
        prevAwayScore: 1,
      });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const template = searchParams.get("template") as Template | null;
  const shouldSend = searchParams.get("send") === "true";
  const to = searchParams.get("to") ?? session.user.email ?? "";

  if (!template || !TEMPLATES.includes(template)) {
    return NextResponse.json(
      { error: `Unknown template. Choose: ${TEMPLATES.join(", ")}` },
      { status: 400 }
    );
  }

  const html = buildPreviewHtml(template);

  if (shouldSend) {
    if (!to) return NextResponse.json({ error: "No recipient email" }, { status: 400 });
    await sendEmail({ to, subject: `[Preview] ${template} — WC2026`, html });
    return NextResponse.json({ ok: true, sentTo: to });
  }

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
