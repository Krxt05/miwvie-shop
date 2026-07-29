import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        pink: {
          50: '#FFF0F5',
          100: '#F8C8DC',
          200: '#FFB6C1',
          300: '#FF69B4',
          400: '#FF1493',
          DEFAULT: '#D63384',
          light: '#FF69B4',
          glow: 'rgba(214,51,132,0.18)',
          600: '#C2185B',
        },
        gold: {
          DEFAULT: '#C2185B',
          light: '#D63384',
          glow: 'rgba(194,24,91,0.18)',
        },
        surface: 'rgba(255,255,255,0.7)',
        border: 'rgba(214,51,132,0.12)',
        bg: '#FFF0F5',
      },
      fontFamily: {
        sans: ['var(--font-noto)', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
      backgroundImage: {
        'glow-pink': 'radial-gradient(ellipse at center, rgba(255,105,180,0.18) 0%, transparent 70%)',
        'gradient-dark': 'linear-gradient(180deg, #FFF0F5 0%, #F8C8DC 100%)',
      },
      boxShadow: {
        'pink-glow': '0 8px 28px rgba(214,51,132,0.2)',
        'pink-glow-sm': '0 4px 14px rgba(214,51,132,0.16)',
        'gold-glow': '0 8px 28px rgba(194,24,91,0.2)',
        'gold-glow-sm': '0 4px 14px rgba(194,24,91,0.16)',
        glass: '0 8px 24px rgba(214,51,132,0.1)',
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
          '0%,100%': { boxShadow: '0 0 0 rgba(214,51,132,0.25), 0 0 0 rgba(194,24,91,0.1)' },
          '50%': { boxShadow: '0 0 24px rgba(214,51,132,0.35), 0 0 36px rgba(194,24,91,0.15)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
