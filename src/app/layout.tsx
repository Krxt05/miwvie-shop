import type { Metadata } from 'next'
import { Noto_Sans_Thai, Playfair_Display } from 'next/font/google'
import './globals.css'

const noto = Noto_Sans_Thai({
  subsets: ['thai'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-noto',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: 'MIWVIE SHOP — เช่ากล้องดิจิตอล มมส.',
  description: 'เช่ากล้องดิจิตอล Canon IXY ราคาถูก ส่งทั่วประเทศ',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
  openGraph: {
    title: 'MIWVIE SHOP',
    description: 'เช่ากล้องดิจิตอล Canon IXY ราคาถูก ส่งทั่วประเทศ',
    images: ['/og.jpg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${noto.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  )
}
