/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand color palette (from eegbrand.sty)
        'brand': {
          'navy': 'var(--brand-navy)',
          'gold': 'var(--brand-gold)',
          'light-gold': 'var(--brand-light-gold)',
          'white': 'var(--brand-white)',
          'light-gray': 'var(--brand-light-gray)',
          'med-gray': 'var(--brand-med-gray)',
          'green': 'var(--brand-green)',
          'red': 'var(--brand-red)',
          'blue': 'var(--brand-blue)',
        },
        // Legacy support (backward compatibility)
        'navy': 'var(--brand-navy)',
        'navy-dark': 'var(--navy-dark)',
        'navy-light': 'var(--navy-light)',
        'gold': 'var(--brand-gold)',
        'gold-light': 'var(--brand-light-gold)',
        'wood': 'var(--wood)',
      },
    },
  },
  plugins: [],
}