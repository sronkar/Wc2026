import { ImageResponse } from "next/og";

// iOS home-screen icon (Apple touch icon). 180×180 is Apple's preferred size.
// Solid background — no transparency — because iOS renders touch icons on the
// home screen with rounded corners applied by the OS itself.
//
// Same typographic mark as /icon to keep the brand consistent and to avoid
// emoji-font dependency on the rendering runtime.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <div style={{ fontSize: 86, lineHeight: 1, color: "white" }}>WC</div>
        <div style={{ fontSize: 36, lineHeight: 1, marginTop: 6 }}>2026</div>
      </div>
    ),
    { ...size }
  );
}
