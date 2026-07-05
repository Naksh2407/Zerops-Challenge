/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#04050d', // Deep obsidian black
          900: '#090b1a', // Rich cyber-obsidian dark blue
          850: '#0f122b', // Deep indigo-blue panel background
          800: '#161a3d', // Border blue-dark
          700: '#23295c',
          650: '#343c85',
          600: '#4853b0',
          500: '#6472d6'
        }
      }
    },
  },
  plugins: [],
}
