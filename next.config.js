/** @type {import('next').NextConfig} */
//
// Security headers applied to every response. Kept conservative so we don't
// break NextAuth, the service worker, or web push:
//   - HSTS preloads HTTPS for a year (only meaningful in prod over HTTPS).
//   - X-Content-Type-Options stops MIME sniffing.
//   - X-Frame-Options blocks clickjacking via iframes.
//   - Referrer-Policy avoids leaking full URLs (incl. tokens) on outbound links.
//   - Permissions-Policy turns off browser features we never use.
// CSP intentionally omitted — adding one needs careful auditing of every
// inline script/style Next emits and is best done as a separate hardening
// pass with `next-safe` or similar.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options",   value: "nosniff" },
  { key: "X-Frame-Options",          value: "DENY" },
  { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",       value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig = {
  async redirects() {
    return [
      { source: "/leaderboard", destination: "/groups", permanent: false },
      { source: "/matches", destination: "/groups", permanent: false },
      { source: "/dashboard", destination: "/groups", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Service worker file: never cache so SW updates roll out promptly.
      // The browser still revalidates by hash via the registration call.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

module.exports = nextConfig;
