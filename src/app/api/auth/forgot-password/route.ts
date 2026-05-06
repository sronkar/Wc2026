import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes, createHash } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

// Hashed identifier so the verificationToken row doesn't carry the email in
// plaintext. A DB or backup leak no longer reveals which addresses are
// mid-reset. Format keeps the "reset:" prefix so the SHA-256 input is
// distinct per use case (reset vs. magic link).
//
// (Local helper — not exported. Next.js route files can only export the HTTP
// method handlers; an extra named export breaks the build.)
function resetIdentifier(email: string): string {
  return "reset:" + createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

export async function POST(req: NextRequest) {
  // Uniform-latency floor. We aim to hold the response for at least this
  // many ms regardless of whether the email exists, to flatten the timing
  // side-channel an attacker would otherwise use to enumerate accounts.
  const startedAt = Date.now();
  const MIN_RESPONSE_MS = 250;
  const respondAfterFloor = async () => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }
  };

  const { email } = await req.json();
  if (!email?.trim()) {
    await respondAfterFloor();
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Rate limit: 5/hour per IP and 3/hour per email address
  const ip = getClientIp(req);
  const ipLimit = rateLimit(`forgot:ip:${ip}`, 5, 60 * 60 * 1000);
  const emailLimit = rateLimit(`forgot:email:${normalizedEmail}`, 3, 60 * 60 * 1000);
  const hit = !ipLimit.ok ? ipLimit : !emailLimit.ok ? emailLimit : null;
  if (hit) {
    await respondAfterFloor();
    return NextResponse.json(
      { error: "Too many password reset requests. Try again later." },
      { status: 429, headers: rateLimitHeaders(hit) }
    );
  }

  const identifier = resetIdentifier(normalizedEmail);

  // Always return 200 to avoid email enumeration
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.password) {
    // No account or not a password-based user — silently succeed, but hold
    // the response to the same floor so the timing channel is closed.
    await respondAfterFloor();
    return NextResponse.json({ ok: true });
  }

  // Delete any existing reset token for this address (legacy "reset:email" rows
  // are also covered by the legacy identifier check below for backwards compat).
  await prisma.verificationToken.deleteMany({
    where: { OR: [{ identifier }, { identifier: `reset:${normalizedEmail}` }] },
  });

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password/${token}`;
  // Fire-and-forget: don't let SMTP latency become a timing oracle for
  // "this email exists". The user's response time is bounded by the floor.
  sendPasswordResetEmail({
    to: normalizedEmail,
    name: user.name ?? "there",
    resetUrl,
  }).catch((e) => console.error("[forgot-password] email send failed:", e));

  await respondAfterFloor();
  return NextResponse.json({ ok: true });
}
