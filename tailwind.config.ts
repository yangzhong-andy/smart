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
        "gradient-drift": {
          "0%, 100%": { opacity: "0.3", transform: "translate(0, 0) scale(1)" },
          "50%": { opacity: "0.5", transform: "translate(10%, 10%) scale(1.05)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0) translateX(0)" },
          "33%": { transform: "translateY(-8px) translateX(4px)" },
          "66%": { transform: "translateY(4px) translateX(-4px)" },
        },
        "card-in": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(34, 211, 238, 0.15)" },
          "50%": { boxShadow: "0 0 32px rgba(34, 211, 238, 0.25)" },
        },
      },
      animation: {
        "progress-shrink": "progress-shrink 0.8s ease-out forwards",
        "gradient-drift": "gradient-drift 8s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "card-in": "card-in 0.5s ease-out forwards",
        "shimmer": "shimmer 2.5s linear infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
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

