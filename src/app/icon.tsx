import { ImageResponse } from "next/og";

// Auto-generated browser/PWA icon, served at /icon. Used by manifest.webmanifest
// (192×192) and by the service worker as the notification icon.
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
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
          letterSpacing: "-2px",
        }}
      >
        ⚽
      </div>
    ),
    { ...size }
  );
}
