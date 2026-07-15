import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configuration options
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Helps Turbopack TLS fetches on Windows when network resources are needed.
    turbopackUseSystemTlsCerts: true,
    serverActions: {
      // Allow multi-file confirmation uploads; payloads no longer embed base64 images.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
