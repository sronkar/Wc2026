import { ImageResponse } from "next/og";

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
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        {/* Soccer ball — Telstar pattern */}
        <svg width="130" height="130" viewBox="0 0 192 192">
          <defs>
            <clipPath id="aball">
              <circle cx="96" cy="96" r="80"/>
            </clipPath>
          </defs>
          <circle cx="96" cy="96" r="80" fill="white"/>
          <g clipPath="url(#aball)" transform="rotate(-20, 96, 96)">
            <polygon points="96,68.2 122.5,87.4 112.4,118.5 79.7,118.5 69.5,87.4" fill="#111111"/>
            <line x1="96" y1="68.2" x2="96" y2="43.9" stroke="#111111" strokeWidth="6"/>
            <line x1="122.5" y1="87.4" x2="145.5" y2="80.0" stroke="#111111" strokeWidth="6"/>
            <line x1="112.4" y1="118.5" x2="126.6" y2="138.0" stroke="#111111" strokeWidth="6"/>
            <line x1="79.7" y1="118.5" x2="65.4" y2="138.0" stroke="#111111" strokeWidth="6"/>
            <line x1="69.5" y1="87.4" x2="46.5" y2="80.0" stroke="#111111" strokeWidth="6"/>
            <polygon points="96,43.9 69.4,24.7 79.6,-6.7 112.4,-6.7 122.6,24.7" fill="#111111"/>
            <polygon points="145.5,80.0 155.7,48.6 188.5,48.6 198.7,80.0 172.1,99.3" fill="#111111"/>
            <polygon points="126.6,138.0 159.4,138.0 169.6,169.4 143.0,188.7 116.4,169.4" fill="#111111"/>
            <polygon points="65.4,138.0 75.6,169.4 49.0,188.7 22.4,169.4 32.6,138.0" fill="#111111"/>
            <polygon points="46.5,80.0 19.9,99.3 -6.7,80.0 3.5,48.6 36.3,48.6" fill="#111111"/>
          </g>
          <circle cx="96" cy="96" r="80" fill="none" stroke="#cccccc" strokeWidth="2"/>
        </svg>
        <div
          style={{
            color: "#C9A84C",
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "3px",
            marginTop: 6,
          }}
        >
          WC 2026
        </div>
      </div>
    ),
    { ...size }
  );
}
