/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bean: {
          50: '#fdf8ec',
          100: '#f9edcd',
          200: '#f2d99b',
          300: '#eabf62',
          400: '#e3a636',
          500: '#d2891d',
          600: '#b96a15',
          700: '#954c15',
          800: '#7a3d18',
          900: '#653318',
          950: '#3a1a09',
        },
        ink: {
          900: '#0b0a08',
          850: '#12100c',
          800: '#17140f',
          700: '#211d16',
          600: '#2b2531',
          500: '#3a3227',
        },
        cream: {
          50: '#fbf7ee',
          100: '#f5efe2',
          200: '#e9e0cd',
          300: '#d6c9af',
          400: '#a99c85',
          500: '#8a7e69',
        },
        mint: '#8fd6a4',
        coral: '#f27a6a',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        bean: '0 18px 40px -20px rgba(210, 137, 29, 0.55)',
        panel: '0 20px 50px -30px rgba(0, 0, 0, 0.9)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(0.85)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        pulseDot: 'pulseDot 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
