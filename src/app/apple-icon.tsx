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
            <line x1="96" y1="68.2" x2="96" y2="48" stroke="#111111" strokeWidth="6"/>
            <line x1="122.5" y1="87.4" x2="141.6" y2="81.2" stroke="#111111" strokeWidth="6"/>
            <line x1="112.4" y1="118.5" x2="124.2" y2="134.8" stroke="#111111" strokeWidth="6"/>
            <line x1="79.7" y1="118.5" x2="67.8" y2="134.8" stroke="#111111" strokeWidth="6"/>
            <line x1="69.5" y1="87.4" x2="50.4" y2="81.2" stroke="#111111" strokeWidth="6"/>
            <polygon points="96,48 65.5,25.9 77.2,-9.9 114.8,-9.9 126.5,25.9" fill="#111111"/>
            <polygon points="141.6,81.2 153.2,45.4 190.9,45.4 202.6,81.2 172.1,103.3" fill="#111111"/>
            <polygon points="124.2,134.8 161.9,134.8 173.5,170.6 143.0,192.7 112.6,170.6" fill="#111111"/>
            <polygon points="67.8,134.8 79.4,170.6 49.0,192.7 18.5,170.6 30.1,134.8" fill="#111111"/>
            <polygon points="50.4,81.2 19.9,103.3 -10.6,81.2 1.1,45.4 38.8,45.4" fill="#111111"/>
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
