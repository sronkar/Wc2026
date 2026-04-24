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

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || !record.identifier.startsWith("reset:")) {
    return NextResponse.json({ error: "This reset link is invalid" }, { status: 400 });
  }
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } });
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
  }

  const email = record.identifier.replace(/^reset:/, "");
  const user = await prisma.user.findUnique({ where: { email } });
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
