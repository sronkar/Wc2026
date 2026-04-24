import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Browsers fetch this to enable
// "Add to Home Screen" and to size + colour the standalone-mode launch screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WC2026 Predictions",
    short_name: "WC2026",
    description: "Predict FIFA World Cup 2026 match results and compete with friends.",
    // When the user opens the installed app, drop them on /groups (their leagues),
    // not the marketing homepage.
    start_url: "/groups",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9fafb", // bg-gray-50, matches the body bg so launch is seamless
    theme_color: "#003366",       // navbar fifa-blue, matches the viewport themeColor
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
