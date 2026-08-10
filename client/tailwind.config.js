/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0b0d12',
          800: '#12151d',
          700: '#1a1f2b',
          600: '#232a39',
          500: '#313a4d',
        },
        brand: {
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
