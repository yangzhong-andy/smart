import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      keyframes: {
        "progress-shrink": {
          "0%": { width: "0%" },
          "100%": { width: "100%" },
        },
      },
      animation: {
        "progress-shrink": "progress-shrink 0.8s ease-out forwards",
      },
      colors: {
        primary: {
          50: "#e0f7ff",
          100: "#b3e5ff",
          200: "#80d2ff",
          300: "#4dbeff",
          400: "#1aabff",
          500: "#00E5FF", // 电光蓝主色
          600: "#00B8CC",
          700: "#008B99",
          800: "#005E66",
          900: "#003133"
        },
        sidebar: "rgba(15, 23, 42, 0.8)"
      },
      boxShadow: {
        'glow-blue': '0 8px 32px rgba(0, 229, 255, 0.05)',
        'glow-blue-strong': '0 8px 32px rgba(0, 229, 255, 0.15)',
      },
      backdropBlur: {
        'sidebar': '10px',
      }
    }
  },
  plugins: []
};

export default config;

