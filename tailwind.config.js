/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./renderer/index.html",
    "./renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        light: {
          bg: '#ffffff',
          text: '#000000',
          border: '#e5e7eb',
        },
        dark: {
          bg: '#000000',
          text: '#ffffff',
          border: '#374151',
        }
      }
    },
  },
  plugins: [],
  darkMode: 'class',
}
