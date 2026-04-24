import { ImageResponse } from "next/og";

// Auto-generated browser/PWA icon, served at /icon. Used by manifest.webmanifest
// (192×192) and by the service worker as the notification icon.
//
// We use a typographic mark instead of an emoji because emoji rendering inside
// next/og's ImageResponse depends on whether the runtime environment ships a
// colour-emoji font. On bare Linux containers (some self-hosted Vercel-likes,
// Docker images without `fonts-noto-color-emoji`) the ⚽ falls back to a
// monochrome glyph or a tofu box. A plain text mark on a solid background
// renders identically everywhere.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#003366",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#C9A84C",
          fontWeight: 900,
          letterSpacing: "-1px",
        }}
      >
        <div style={{ fontSize: 92, lineHeight: 1, color: "white" }}>WC</div>
        <div style={{ fontSize: 38, lineHeight: 1, marginTop: 6 }}>2026</div>
      </div>
    ),
    { ...size }
  );
}
