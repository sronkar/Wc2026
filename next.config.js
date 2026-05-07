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
  // Allow phones / tablets on the local network to access the dev server.
  // The wildcard covers any 192.168.x.x device on a standard home/office LAN.
  allowedDevOrigins: ["192.168.*.*"],
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["nodemailer", "web-push", "node-cron"],
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // In the Edge runtime and the browser bundle, Node built-ins don't exist.
    // web-push → https-proxy-agent → agent-base → require('http') would fail.
    // Alias every server-only package to an empty stub so webpack stops
    // trying to bundle their Node-specific dependency trees.
    if (!isServer || nextRuntime === "edge") {
      const noop = require("path").resolve(__dirname, "src/lib/stubs/noop.js");
      config.resolve.alias = {
        ...config.resolve.alias,
        "web-push": noop,
        "nodemailer": noop,
        "node-cron": noop,
        "https-proxy-agent": noop,
        "agent-base": noop,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        http: false,
        https: false,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        child_process: false,
      };
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

module.exports = nextConfig;
