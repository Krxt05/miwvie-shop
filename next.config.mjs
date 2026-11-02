

// Browsers may keep photos/fonts instead of re-checking each visit. A week
// (not forever) for photos so a replaced file still shows up; fonts never change.
const WEEK = 'public, max-age=604800, stale-while-revalidate=86400'
const nextConfig = {
  async headers() {
    return [
      { source: '/mood/:path*', headers: [{ key: 'Cache-Control', value: WEEK }] },
      { source: '/cameras/:path*', headers: [{ key: 'Cache-Control', value: WEEK }] },
      { source: '/logo.png', headers: [{ key: 'Cache-Control', value: WEEK }] },
      { source: '/og.jpg', headers: [{ key: 'Cache-Control', value: WEEK }] },
      { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'camera-2-0.vercel.app' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '**.googleapis.com' },
    ],
  },
}

export default nextConfig
