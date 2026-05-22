import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack – use stable webpack for all builds
  turbopack: false,
};

export default nextConfig;