import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        pink: {
          DEFAULT: '#e05a8c',
          light: '#f090b4',
          glow: 'rgba(224,90,140,0.25)',
        },
        gold: {
          DEFAULT: '#d4a227',
          light: '#e8c050',
          glow: 'rgba(212,162,39,0.25)',
        },
        surface: 'rgba(255,255,255,0.05)',
        border: 'rgba(255,255,255,0.08)',
        bg: '#09060e',
      },
      fontFamily: {
        sans: ['var(--font-noto)', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
      backgroundImage: {
        'glow-pink': 'radial-gradient(ellipse at center, rgba(224,90,140,0.12) 0%, transparent 70%)',
        'gradient-dark': 'linear-gradient(135deg, #09060e 0%, #1a0a1e 50%, #09060e 100%)',
      },
      boxShadow: {
        'pink-glow': '0 0 30px rgba(224,90,140,0.35)',
        'pink-glow-sm': '0 0 12px rgba(224,90,140,0.2)',
        'gold-glow': '0 0 30px rgba(212,162,39,0.4)',
        'gold-glow-sm': '0 0 12px rgba(212,162,39,0.25)',
        glass: '0 8px 32px rgba(0,0,0,0.4)',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-pink': 'pulsePink 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        pulsePink: {
          '0%,100%': { boxShadow: '0 0 20px rgba(224,90,140,0.3), 0 0 40px rgba(212,162,39,0.15)' },
          '50%': { boxShadow: '0 0 40px rgba(224,90,140,0.5), 0 0 60px rgba(212,162,39,0.3)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
