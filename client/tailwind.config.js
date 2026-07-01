/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        procurement: '#1B5E8B',
        'freight-forwarding': '#4A1E8B',
        logistics: '#0E6B5E',
        navy: '#1B3A6B',
        teal: '#00A3B4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
