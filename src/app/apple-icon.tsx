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
          <g clipPath="url(#aball)">
            <polygon points="96,64 126.4,86.1 114.8,121.9 77.2,121.9 65.6,86.1" fill="#111111"/>
            <line x1="96" y1="64" x2="96" y2="16" stroke="#111111" strokeWidth="5"/>
            <line x1="126.4" y1="86.1" x2="172.1" y2="71.3" stroke="#111111" strokeWidth="5"/>
            <line x1="114.8" y1="121.9" x2="143.1" y2="160.7" stroke="#111111" strokeWidth="5"/>
            <line x1="77.2" y1="121.9" x2="48.9" y2="160.7" stroke="#111111" strokeWidth="5"/>
            <line x1="65.6" y1="86.1" x2="19.9" y2="71.3" stroke="#111111" strokeWidth="5"/>
            <polygon points="96,16 126.4,-6.1 114.8,-41.9 77.2,-41.9 65.6,-6.1" fill="#111111"/>
            <polygon points="172.1,71.3 183.7,35.5 221.3,35.5 232.9,71.3 202.5,93.4" fill="#111111"/>
            <polygon points="143.1,160.7 180.7,160.7 192.3,196.5 161.9,218.6 131.5,196.5" fill="#111111"/>
            <polygon points="48.9,160.7 11.3,160.7 -0.3,196.5 30.1,218.6 60.5,196.5" fill="#111111"/>
            <polygon points="19.9,71.3 8.3,35.5 -29.3,35.5 -40.9,71.3 -10.5,93.4" fill="#111111"/>
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
