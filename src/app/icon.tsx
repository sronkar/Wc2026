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
          <g clipPath="url(#ball)" transform="rotate(-20, 96, 96)">
            <polygon points="96,66 124.5,86.7 113.6,120.3 78.4,120.3 67.5,86.7" fill="#111111"/>
            <line x1="96" y1="66" x2="96" y2="63" stroke="#111111" strokeWidth="5"/>
            <line x1="124.5" y1="86.7" x2="127.4" y2="85.8" stroke="#111111" strokeWidth="5"/>
            <line x1="113.6" y1="120.3" x2="115.4" y2="122.7" stroke="#111111" strokeWidth="5"/>
            <line x1="78.4" y1="120.3" x2="76.6" y2="122.7" stroke="#111111" strokeWidth="5"/>
            <line x1="67.5" y1="86.7" x2="64.6" y2="85.8" stroke="#111111" strokeWidth="5"/>
            <polygon points="96,63 58,35.4 72.5,-9.4 119.5,-9.4 134,35.4" fill="#111111"/>
            <polygon points="127.4,85.8 141.9,41.1 188.9,41.1 203.4,85.8 165.4,113.4" fill="#111111"/>
            <polygon points="115.4,122.7 162.5,122.7 177,167.4 138.9,195.1 100.9,167.4" fill="#111111"/>
            <polygon points="76.6,122.7 91.1,167.4 53.1,195.1 15,167.4 29.6,122.7" fill="#111111"/>
            <polygon points="64.6,85.8 26.6,113.4 -11.5,85.8 3.1,41.1 50.1,41.1" fill="#111111"/>
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
