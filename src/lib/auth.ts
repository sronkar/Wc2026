import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import nodemailer from "nodemailer";
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
        // Always log so local dev works without an SMTP server
        console.log("\n========================================");
        console.log(`[AUTH] Magic link for: ${email}`);
        console.log(`[AUTH] Sign-in URL:\n  ${url}`);
        console.log("========================================\n");

        // Also send real email in production if SMTP is configured
        if (process.env.NODE_ENV === "production") {
          const transport = nodemailer.createTransport({
            host: process.env.EMAIL_SERVER_HOST,
            port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
            auth: {
              user: process.env.EMAIL_SERVER_USER,
              pass: process.env.EMAIL_SERVER_PASSWORD,
            },
          });
          await transport.sendMail({
            to: email,
            from: process.env.EMAIL_FROM,
            subject: "Your WC2026 sign-in link",
            text: `Sign in to WC2026:\n\n${url}\n\nThis link expires in 24 hours.`,
            html: `<p>Sign in to WC2026 by clicking the link below:</p><p><a href="${url}">${url}</a></p><p>This link expires in 24 hours.</p>`,
          });
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
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
    strategy: "database",
  },
};
