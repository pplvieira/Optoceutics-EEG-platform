/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'navy': 'var(--navy)',
        'navy-dark': 'var(--navy-dark)',
        'navy-light': 'var(--navy-light)',
        'gold': 'var(--gold)',
        'gold-light': 'var(--gold-light)',
        'wood': 'var(--wood)',
      },
    },
  },
  plugins: [],
}