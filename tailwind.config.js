/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#0B1424',
        forest: '#0548E8',
        mint: '#DBEAFE',
        paper: '#F8FAFC',
        line: '#E2E8F0',
        amber: '#38BDF8',
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '2px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
