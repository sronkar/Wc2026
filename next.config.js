/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/leaderboard", destination: "/groups", permanent: false },
      { source: "/matches", destination: "/groups", permanent: false },
      { source: "/dashboard", destination: "/groups", permanent: false },
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
