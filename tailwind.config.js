/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        fifa: {
          blue: "#003366",
          gold: "#C9A84C",
          red: "#D32F2F",
        },
        pitch: {
          DEFAULT: "#16a34a",
          dark: "#15803d",
          light: "#dcfce7",
        },
        energy: {
          DEFAULT: "#f97316",
          dark: "#ea580c",
          light: "#ffedd5",
        },
      },
      backgroundImage: {
        "navbar-gradient": "linear-gradient(135deg, #001f3f 0%, #003366 55%, #004080 100%)",
        "gold-shine": "linear-gradient(135deg, #b8932a 0%, #e8c55a 50%, #b8932a 100%)",
        "pitch-fade": "linear-gradient(180deg, #003366 0%, #001a33 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "70%": { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "live-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "score-flash": {
          "0%": { backgroundColor: "rgb(254 240 138)" },
          "100%": { backgroundColor: "transparent" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        pop: "pop 0.25s ease-out both",
        "live-pulse": "live-pulse 1.4s ease-in-out infinite",
        "score-flash": "score-flash 1.5s ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
      },
      boxShadow: {
        "card-hover": "0 4px 20px rgba(0, 51, 102, 0.12)",
        "podium-gold": "0 8px 24px rgba(201, 168, 76, 0.35)",
        "podium-silver": "0 6px 18px rgba(148, 163, 184, 0.3)",
        "podium-bronze": "0 6px 18px rgba(180, 120, 60, 0.25)",
      },
    },
  },
  plugins: [],
};
