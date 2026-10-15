import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Wine palette (matches the shop's price poster). Kept under the `pink`
        // name so every existing pink-* class picks it up.
        pink: {
          50: '#FBF6F2',
          100: '#EFE4DE',
          200: '#DEC3C5',
          300: '#C88D97',
          400: '#A8475A',
          DEFAULT: '#8C2B3F',
          light: '#A8475A',
          glow: 'rgba(140,43,63,0.18)',
          500: '#8C2B3F',
          600: '#6E1F31',
          700: '#5A1828',
          800: '#45121F',
          900: '#2E0C15',
        },
        gold: {
          DEFAULT: '#6E1F31',
          light: '#8C2B3F',
          glow: 'rgba(110,31,49,0.18)',
        },
        brass: {
          DEFAULT: '#C9A45C',
          light: '#E2C98F',
          dark: '#A07D3B',
        },
        cream: '#F6EEE8',
        ink: '#2B1D1F',
        surface: 'rgba(255,255,255,0.7)',
        border: 'rgba(140,43,63,0.12)',
        bg: '#FBF6F2',
      },
      fontFamily: {
        sans: ['var(--font-noto)', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-serif-thai)', 'serif'],
      },
      backgroundImage: {
        'glow-pink': 'radial-gradient(ellipse at center, rgba(168,71,90,0.18) 0%, transparent 70%)',
        'gradient-dark': 'linear-gradient(180deg, #FBF6F2 0%, #EFE4DE 100%)',
      },
      boxShadow: {
        'pink-glow': '0 8px 28px rgba(140,43,63,0.2)',
        'pink-glow-sm': '0 4px 14px rgba(140,43,63,0.16)',
        'gold-glow': '0 8px 28px rgba(110,31,49,0.2)',
        'gold-glow-sm': '0 4px 14px rgba(110,31,49,0.16)',
        glass: '0 8px 24px rgba(140,43,63,0.1)',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-pink': 'pulsePink 2s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulsePink: {
          '0%,100%': { boxShadow: '0 0 0 rgba(140,43,63,0.25), 0 0 0 rgba(110,31,49,0.1)' },
          '50%': { boxShadow: '0 0 24px rgba(140,43,63,0.35), 0 0 36px rgba(110,31,49,0.15)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
