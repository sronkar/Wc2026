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
      },
    },
  },
  plugins: [],
};
