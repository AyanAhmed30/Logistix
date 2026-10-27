import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack to this app directory so CSS deps (tailwindcss) resolve from
  // Logistix/node_modules — not the parent mega/ folder.
  turbopack: {
    root: path.join(__dirname),
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
