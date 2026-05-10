import { ImageResponse } from "next/og";

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
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        {/* Soccer ball — Telstar pattern: center pentagon + 5 edge patches */}
        <svg width="140" height="140" viewBox="0 0 192 192">
          <defs>
            <clipPath id="ball">
              <circle cx="96" cy="96" r="80"/>
            </clipPath>
          </defs>
          {/* White ball */}
          <circle cx="96" cy="96" r="80" fill="white"/>
          <g clipPath="url(#ball)" transform="rotate(20, 96, 96)">
            {/* Center black pentagon — r=40 (larger patches) */}
            <polygon points="96,56 130.2,79.4 117.6,119.6 74.4,119.6 61.8,79.4" fill="#111111"/>
            {/* Seam lines */}
            <line x1="96" y1="56" x2="96" y2="16" stroke="#111111" strokeWidth="7"/>
            <line x1="130.2" y1="79.4" x2="172.1" y2="71.3" stroke="#111111" strokeWidth="7"/>
            <line x1="117.6" y1="119.6" x2="143.1" y2="160.7" stroke="#111111" strokeWidth="7"/>
            <line x1="74.4" y1="119.6" x2="48.9" y2="160.7" stroke="#111111" strokeWidth="7"/>
            <line x1="61.8" y1="79.4" x2="19.9" y2="71.3" stroke="#111111" strokeWidth="7"/>
            {/* 5 edge pentagon patches — r=40, clipped to circle */}
            <polygon points="96,16 130.2,-7.4 117.6,-47.6 74.4,-47.6 61.8,-7.4" fill="#111111"/>
            <polygon points="172.1,71.3 182.6,31.8 222.8,23.7 243.5,60.7 230.9,99.5" fill="#111111"/>
            <polygon points="143.1,160.7 183.3,168.8 193.8,209.3 157.1,231.7 122.3,212.4" fill="#111111"/>
            <polygon points="48.9,160.7 8.7,168.8 -1.8,209.3 35,231.7 69.7,212.4" fill="#111111"/>
            <polygon points="19.9,71.3 9.4,31.8 -30.8,23.7 -51.5,60.7 -38.9,99.5" fill="#111111"/>
          </g>
          {/* Ball outline */}
          <circle cx="96" cy="96" r="80" fill="none" stroke="#cccccc" strokeWidth="2"/>
        </svg>
        {/* App label */}
        <div
          style={{
            color: "#C9A84C",
            fontSize: 15,
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
