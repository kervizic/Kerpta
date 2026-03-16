/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        orange: {
          50:  '#fff8eb',
          100: '#ffecc6',
          200: '#ffda88',
          300: '#ffc34a',
          400: '#ffb020',
          500: '#ff9900',
          600: '#e07800',
          700: '#b85800',
          800: '#954308',
          900: '#7a370b',
          950: '#461a00',
        },
      },
      fontFamily: {
        sarpanch: ['Sarpanch', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
