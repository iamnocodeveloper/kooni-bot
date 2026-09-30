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
        // Paleta de marca de Kooni (docs/IDENTIDAD-KOONI.md, tokens "oscuro").
        // La usa SOLO la landing pública (/giros): el hub sigue en teal.
        brand: {
          bg: "#0f0e17",
          panel: "#181624",
          panel2: "#221d33",
          raise: "#2f2745",
          line: "#332c48",
          linelit: "#463c63",
          accent: "#e05fd8",
          accent2: "#a679f6",
          onaccent: "#170f1c",
          cream: "#ece9f5",
          muted: "#a49bbd",
          dim: "#726a8c",
          ok: "#34d399",
          warn: "#f0b34a",
        },
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
