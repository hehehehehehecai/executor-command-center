import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  logging: {
    incomingRequests: {
      ignore: [/^\/api\/github\/installations\/setup(?:\?|$)/],
    },
  },
};

export default nextConfig;
