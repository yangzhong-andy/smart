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
        "container-pulse-orange": {
          "0%, 100%": {
            boxShadow: "0 0 0 1px rgba(251, 146, 60, 0.5), 0 0 24px rgba(251, 146, 60, 0.2)",
          },
          "50%": {
            boxShadow: "0 0 0 2px rgba(251, 146, 60, 0.85), 0 0 36px rgba(251, 146, 60, 0.45)",
          },
        },
        "container-pulse-purple": {
          "0%, 100%": {
            boxShadow: "0 0 0 1px rgba(192, 132, 252, 0.45), 0 0 22px rgba(168, 85, 247, 0.2)",
          },
          "50%": {
            boxShadow: "0 0 0 2px rgba(192, 132, 252, 0.8), 0 0 34px rgba(168, 85, 247, 0.4)",
          },
        },
        "wave-slide": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "wave-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        "shine-sweep": {
          "0%": { transform: "translateX(-120%) skewX(-15deg)", opacity: "0" },
          "15%": { opacity: "0.55" },
          "45%": { opacity: "0.35" },
          "100%": { transform: "translateX(220%) skewX(-15deg)", opacity: "0" },
        },
        "border-flow": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "hud-blink": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.9" },
        },
        "spark-rise": {
          "0%": { transform: "translateY(8px) scale(0.6)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateY(-28px) scale(0.2)", opacity: "0" },
        },
      },
      animation: {
        "progress-shrink": "progress-shrink 0.8s ease-out forwards",
        "gradient-drift": "gradient-drift 8s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "card-in": "card-in 0.5s ease-out forwards",
        "shimmer": "shimmer 2.5s linear infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "container-pulse-orange": "container-pulse-orange 2.2s ease-in-out infinite",
        "container-pulse-purple": "container-pulse-purple 2.2s ease-in-out infinite",
        "wave-slide": "wave-slide 10s linear infinite",
        "wave-y": "wave-y 3s ease-in-out infinite",
        "shine-sweep": "shine-sweep 5s ease-in-out infinite",
        "border-flow": "border-flow 4s ease infinite",
        "hud-blink": "hud-blink 2.5s ease-in-out infinite",
        "spark-rise": "spark-rise 2.2s ease-out infinite",
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

