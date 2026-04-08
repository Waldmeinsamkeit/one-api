import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(210 20% 98%)",
        panel: "hsl(220 20% 99%)",
        foreground: "hsl(220 12% 15%)",
        muted: "hsl(217 15% 92%)",
        accent: "hsl(188 95% 35%)",
        danger: "hsl(0 80% 52%)",
        success: "hsl(150 65% 38%)"
      }
    }
  },
  plugins: []
} satisfies Config;
