import { ImageResponse } from "next/og";

// iOS home-screen icon (Apple touch icon). 180×180 is Apple's preferred size.
// Solid background — no transparency — because iOS applies rounded corners itself.
// Pure geometric mark, no emoji, for reliable rendering on all runtimes.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            width: 100,
            height: 100,
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
              fontSize: 50,
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
            fontSize: 16,
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
