import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS, PATCH, DELETE, POST, PUT" },
          { key: "Access-Control-Allow-Headers", value: "*" },
          {
            key: "Access-Control-Expose-Headers",
            value:
              "X-Gemprism-Fallback, X-Gemprism-Model, X-Gemprism-Original-Model, X-Gemprism-Key, X-Gemprism-Duration-Ms",
          },
        ],
      },
    ];
  },
};

export default nextConfig;