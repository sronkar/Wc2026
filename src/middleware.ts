import { NextRequest, NextResponse } from "next/server";
import { decode } from "next-auth/jwt";

/**
 * Clear stale session cookies that can't be decoded as JWTs.
 *
 * This covers two migration scenarios:
 *   1. Old opaque database-session tokens (set when strategy was "database")
 *   2. Any other malformed tokens
 *
 * Without this, every request with a stale cookie triggers a
 * [JWT_SESSION_ERROR] JWT invalid log from NextAuth's session route.
 */
export async function middleware(req: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieName = isProduction
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const token = req.cookies.get(cookieName)?.value;
  if (!token) return NextResponse.next();

  // Try to decode — if this throws, the cookie is stale/corrupt
  try {
    const decoded = await decode({ token, secret: process.env.NEXTAUTH_SECRET! });
    if (decoded) return NextResponse.next(); // valid JWT — let it through
  } catch {
    // fall through to clear the cookie
  }

  // Cookie is invalid — clear it before the request reaches any route handler
  const res = NextResponse.next();
  res.cookies.set(cookieName, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export const config = {
  // Run on all routes except static files and Next.js internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
