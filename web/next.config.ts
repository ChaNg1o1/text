import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  experimental: {
    // Increase request size limit for multipart uploads (folder uploads).
    proxyClientMaxBodySize: "256mb",
  },
};

export default nextConfig;
