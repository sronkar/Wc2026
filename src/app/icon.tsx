import { ImageResponse } from "next/og";

// Auto-generated browser/PWA icon, served at /icon. Used by manifest.webmanifest
// (192×192) and by the service worker as the notification icon.
//
// Pure geometric / typographic mark — no emoji — so it renders identically on
// bare Linux containers that lack a colour-emoji font.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(150deg, #001845 0%, #003380 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {/* Gold ring badge */}
        <div
          style={{
            width: 108,
            height: 108,
            borderRadius: "50%",
            border: "5px solid #C9A84C",
            background: "rgba(201,168,76,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              color: "white",
              fontSize: 54,
              fontWeight: 900,
              letterSpacing: "-3px",
              lineHeight: 1,
            }}
          >
            SP
          </div>
        </div>
        {/* WC 2026 label */}
        <div
          style={{
            color: "#C9A84C",
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: "4px",
            lineHeight: 1,
          }}
        >
          WC 2026
        </div>
      </div>
    ),
    { ...size }
  );
}
