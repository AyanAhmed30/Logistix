import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuration options
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
