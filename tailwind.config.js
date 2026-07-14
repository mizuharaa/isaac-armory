/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        basement: {
          DEFAULT: "#16100e",
          panel: "#241a16",
          raised: "#2e211b",
          border: "#4a3628",
        },
        parchment: "#d8c9a3",
        ink: "#e8ddc4",
        muted: "#9b8a72",
        blood: "#b3202a",
        gold: "#c9a227",
        heal: "#7fb069",
        hurt: "#d9534f",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        pixelbody: ["VT323", "monospace"],
      },
    },
  },
  plugins: [],
};
