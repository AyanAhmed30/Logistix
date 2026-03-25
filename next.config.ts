import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuration options
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
