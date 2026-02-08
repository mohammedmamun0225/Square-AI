/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./styles/**/*.{css}"],
  theme: {
    extend: {
      colors: {
        ink: "#1b1b1b",
        sand: "#f8f4ee",
        clay: "#e6d5c2",
        citrus: "#ffb347",
        tide: "#2f6f64",
        ember: "#e85d4a",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-ibm-plex)", "sans-serif"],
      },
      boxShadow: {
        lift: "0 20px 60px rgba(27, 27, 27, 0.15)",
      },
      backgroundImage: {
        "grain": "radial-gradient(circle at 1px 1px, rgba(27,27,27,0.08) 1px, transparent 0)",
        "sunset": "linear-gradient(120deg, rgba(255,179,71,0.24), rgba(47,111,100,0.18), rgba(232,93,74,0.25))",
      },
    },
  },
  plugins: [],
};
