import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        pink: {
          DEFAULT: '#ff2d78',
          light: '#ff6ba8',
          glow: 'rgba(255,45,120,0.25)',
        },
        surface: 'rgba(255,255,255,0.05)',
        border: 'rgba(255,255,255,0.08)',
        bg: '#08000f',
      },
      fontFamily: {
        sans: ['var(--font-noto)', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
      backgroundImage: {
        'glow-pink': 'radial-gradient(ellipse at center, rgba(255,45,120,0.15) 0%, transparent 70%)',
        'gradient-dark': 'linear-gradient(135deg, #08000f 0%, #1a0020 50%, #08000f 100%)',
      },
      boxShadow: {
        'pink-glow': '0 0 30px rgba(255,45,120,0.3)',
        'pink-glow-sm': '0 0 12px rgba(255,45,120,0.2)',
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
          '0%,100%': { boxShadow: '0 0 20px rgba(255,45,120,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(255,45,120,0.6)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
