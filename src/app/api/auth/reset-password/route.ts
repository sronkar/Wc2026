import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit: 10/hour per IP — token brute force is already bounded by
  // 32-byte token entropy, but this cheaply raises the bar.
  const ip = getClientIp(req);
  const hit = rateLimit(`reset:ip:${ip}`, 10, 60 * 60 * 1000);
  if (!hit.ok) {
    return NextResponse.json(
      { error: "Too many password reset attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(hit) }
    );
  }

  const { token, password } = await req.json();

  if (!token || !password || password.length < 12) {
    return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
  }

  // Per-token cap so a leaked token can't be hammered from many IPs.
  const tokenHit = rateLimit(`reset:token:${token}`, 5, 15 * 60 * 1000);
  if (!tokenHit.ok) {
    return NextResponse.json(
      { error: "Too many attempts for this reset link. Please request a new one." },
      { status: 429, headers: rateLimitHeaders(tokenHit) }
    );
  }

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || !record.identifier.startsWith("reset:")) {
    return NextResponse.json({ error: "This reset link is invalid" }, { status: 400 });
  }
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } });
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
  }

  // The identifier is a SHA-256 of the email (current format), or the legacy
  // plaintext "reset:<email>" form for tokens created before the M3 fix.
  // Either way, look up the user by joining via the token row's userId is
  // not possible — verificationToken has no userId — so we must iterate
  // candidate users keyed by hash. We index on the hashed identifier.
  let user;
  const remainder = record.identifier.replace(/^reset:/, "");
  // Heuristic: SHA-256 hex is exactly 64 chars and contains no "@".
  const isHashed = remainder.length === 64 && !remainder.includes("@");
  if (isHashed) {
    // Iterate users with passwords and match by hash. Cheap because reset
    // tokens are short-lived and the hash space is tiny vs. user count.
    const { createHash } = await import("crypto");
    const candidates = await prisma.user.findMany({
      where: { password: { not: null } },
      select: { id: true, email: true, password: true },
    });
    user = candidates.find(
      (u) =>
        u.email !== null &&
        createHash("sha256").update(u.email.toLowerCase().trim()).digest("hex") === remainder
    );
  } else {
    // Legacy plaintext-email identifier
    user = await prisma.user.findUnique({ where: { email: remainder } });
  }
  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
  await prisma.verificationToken.delete({ where: { token } });

  // Invalidate all existing sessions so user must sign in fresh
  await prisma.session.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ ok: true });
}
