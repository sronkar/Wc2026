import { ImageResponse } from "next/og";

// iOS home-screen icon (Apple touch icon). 180×180 is Apple's preferred size.
// Solid background — no transparency — because iOS renders touch icons on the
// home screen with rounded corners applied by the OS itself.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 130,
          background: "#003366",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
        }}
      >
        ⚽
      </div>
    ),
    { ...size }
  );
}
