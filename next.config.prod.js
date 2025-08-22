/** @type {import('next').NextConfig} */
import { repoName } from './lib/repoName.js'

// Replace with the actual repository name

const nextConfig = {
  output: 'export', // Required for static export to GitHub Pages
  basePath: `/${repoName}`,
  assetPrefix: `/${repoName}/`,
  images: {
    unoptimized: true, // Required for static export
  },
  trailingSlash: true, // Helps with GitHub Pages routing
  // Ensure proper UTF-8 encoding for emojis
  experimental: {
    esmExternals: false,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
};

export default nextConfig;