/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  // Hide the Next.js dev-tools floating indicator. It overlaps the bottom-
  // pinned Settings link and pollutes UI screenshots.
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
}

export default nextConfig
