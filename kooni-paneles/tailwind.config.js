/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1016",
        panel: "#121a24",
        panel2: "#0f1620",
        line: "#22303f",
        cream: "#e8eef4",
        muted: "#93a4b5",
        accent: "#2dd4bf",
        accentSoft: "rgba(45,212,191,.13)",
        warn: "#f5b942",
        bad: "#f87171",
        ok: "#34d399",
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
