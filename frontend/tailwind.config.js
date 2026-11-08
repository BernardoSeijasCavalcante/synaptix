/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        synaptix: {
          bg: '#070c1b',
          surface: '#0a1128',
          card: '#0f1a36',
          border: 'rgba(255, 255, 255, 0.08)',
          gold: '#eab308',
          'gold-glow': 'rgba(234, 179, 8, 0.25)',
          purple: '#a855f7',
          'purple-glow': 'rgba(168, 85, 247, 0.25)',
        },
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'glass-hover': '0 12px 40px 0 rgba(0, 0, 0, 0.5), 0 0 20px 0 rgba(234, 179, 8, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
        'glass-gold': '0 0 25px rgba(234, 179, 8, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        'glass-purple': '0 0 25px rgba(168, 85, 247, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
