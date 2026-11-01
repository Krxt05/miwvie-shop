import type { Metadata } from 'next'
import './fonts.css'
import './globals.css'

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
    <html lang="th">
      <head>
        {/* The body font's Thai and Latin files, fetched before the CSS asks for them */}
        <link rel="preload" href="/fonts/noto-sans-thai-normal-300-700-thai.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/noto-sans-thai-normal-300-700-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
