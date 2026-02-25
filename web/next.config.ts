import type { NextConfig } from "next";

const apiOrigin = (process.env.TEXT_API_ORIGIN ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  experimental: {
    // Increase request size limit for proxied multipart uploads (folder uploads).
    // Default is 10MB.
    proxyClientMaxBodySize: "256mb",
  },
  rewrites: async () => [
    {
      source: "/api/v1/:path*",
      destination: `${apiOrigin}/api/v1/:path*`,
    },
  ],
};

export default nextConfig;
