import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-lora)", "Georgia", "serif"],
      },
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dce6ff",
          200: "#b9ccff",
          300: "#86a8ff",
          400: "#567bff",
          500: "#2f52ff",
          600: "#1a30f5",
          700: "#1522e0",
          800: "#171db6",
          900: "#191e8f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
