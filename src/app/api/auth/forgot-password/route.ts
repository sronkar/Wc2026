import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Always return 200 to avoid email enumeration
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.password) {
    // No account or not a password-based user — silently succeed
    return NextResponse.json({ ok: true });
  }

  // Delete any existing reset token for this address
  await prisma.verificationToken.deleteMany({
    where: { identifier: `reset:${normalizedEmail}` },
  });

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.verificationToken.create({
    data: {
      identifier: `reset:${normalizedEmail}`,
      token,
      expires,
    },
  });

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password/${token}`;
  await sendPasswordResetEmail({
    to: normalizedEmail,
    name: user.name ?? "there",
    resetUrl,
  });

  return NextResponse.json({ ok: true });
}
