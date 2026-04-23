import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { decode as defaultDecode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      sendVerificationRequest: async ({ identifier: email, url }) => {
        // Always log — dev works without SMTP, and gives a quick copy-paste URL
        console.log("\n========================================");
        console.log(`[AUTH] Magic link for: ${email}`);
        console.log(`[AUTH] Sign-in URL:\n  ${url}`);
        console.log("========================================\n");

        // Send branded email in production
        if (process.env.NODE_ENV === "production") {
          const { sendEmail, buildMagicLinkHtml } = await import("@/lib/email");
          await sendEmail({
            to: email,
            subject: "Your WC2026 sign-in link",
            html: buildMagicLinkHtml(url),
          });
        }
      },
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user?.password) return null;
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // First sign-in: load fresh role from DB so any signIn-callback
        // role promotions (e.g. ADMIN_EMAIL) are reflected immediately.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        token.sub = user.id;
        token.role = dbUser?.role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as string) ?? "USER";
      }
      return session;
    },
    async signIn({ user }) {
      // Promote to admin if email matches env variable.
      // updateMany avoids a crash when the user record doesn't exist yet
      // (the adapter creates it after this callback returns).
      if (user.email && user.email === process.env.ADMIN_EMAIL) {
        await prisma.user.updateMany({
          where: { email: user.email },
          data: { role: "ADMIN" },
        });
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
  },
  session: {
    // JWT strategy is required for CredentialsProvider to work correctly.
    // With "database" strategy, credentials sign-ins issue a JWT internally
    // but session lookups expect a DB row → always returns empty session.
    strategy: "jwt",
  },
  jwt: {
    // Silently discard stale opaque DB session tokens that were set before the
    // strategy was changed to "jwt". Without this, those cookies cause a flood
    // of [JWT_SESSION_ERROR] Invalid Compact JWE errors in the server log.
    decode: async (params) => {
      try {
        return await defaultDecode(params);
      } catch (err) {
        // Log what kind of error we're silencing so we can diagnose issues
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("JWEInvalid") && !msg.includes("compact JWE")) {
          console.warn("[auth] JWT decode failed:", msg);
        }
        return null;
      }
    },
  },
};
