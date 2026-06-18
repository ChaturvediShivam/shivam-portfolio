/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        consulting: {
          navy: {
            DEFAULT: "#0A192F",
            light: "#112240",
            dark: "#020C1B",
          },
          slate: {
            DEFAULT: "#64748B",
            light: "#94A3B8",
            dark: "#475569",
          },
          royal: {
            DEFAULT: "#2563EB",
            light: "#3B82F6",
            dark: "#1D4ED8",
          },
          background: {
            light: "#F8FAFC",
            dark: "#020C1B",
          },
          text: {
            light: "#0F172A",
            dark: "#F8FAFC",
          }
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.6s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
