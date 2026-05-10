import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Browsers fetch this to enable
// "Add to Home Screen" and to size + colour the standalone-mode launch screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SoccerPicks WC 2026",
    short_name: "SoccerPicks",
    description: "Predict FIFA World Cup 2026 match results and compete with friends.",
    // When the user opens the installed app, drop them on /groups (their leagues),
    // not the marketing homepage.
    start_url: "/groups",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9fafb", // bg-gray-50, matches the body bg so launch is seamless
    theme_color: "#003366",       // navbar fifa-blue, matches the viewport themeColor
    // Next.js's Manifest types reject the legacy space-separated
    // `"any maskable"` purpose value — it only accepts a single purpose per
    // entry. Split into two icon entries (same src, different purpose) so a
    // launcher can pick whichever it prefers without losing maskable support.
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
