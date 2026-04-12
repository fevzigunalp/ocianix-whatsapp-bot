import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Produce a self-contained production server at .next/standalone
  // so the Docker image can be slim and run `node server.js` directly.
  output: 'standalone',
}

export default nextConfig
