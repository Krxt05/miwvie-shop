import type { Metadata } from 'next'
import { Noto_Sans_Thai, Noto_Serif_Thai, Playfair_Display } from 'next/font/google'
import './globals.css'

const noto = Noto_Sans_Thai({
  subsets: ['thai'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto',
})

// Thai glyphs for display headings — Playfair has none, so Thai text in
// font-display falls through to this serif instead of the sans body font.
const notoSerif = Noto_Serif_Thai({
  subsets: ['thai'],
  weight: ['500', '700'],
  variable: '--font-serif-thai',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://miwvie-shop.vercel.app'),
  title: 'MIWVIE SHOP — เช่ากล้องดิจิตอล มมส.',
  description: 'เช่ากล้องดิจิตอล Canon IXY ราคาถูก',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
  openGraph: {
    title: 'MIWVIE SHOP',
    description: 'เช่ากล้องดิจิตอล Canon IXY ราคาถูก',
    images: ['/logo.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${noto.variable} ${notoSerif.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  )
}
