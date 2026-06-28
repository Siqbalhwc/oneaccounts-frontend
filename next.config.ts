import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,   // ← security: hides readable code in production
};

export default nextConfig;