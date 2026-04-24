

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'camera-2-0.vercel.app' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '**.googleapis.com' },
    ],
  },
}

export default nextConfig
