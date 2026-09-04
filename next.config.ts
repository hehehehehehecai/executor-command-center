import type { NextConfig } from "next";
import { buildHttpSecurityHeaders } from "./src/shared/security/http-security-headers";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  logging: {
    incomingRequests: {
      ignore: [/^\/api\/github\/installations\/setup(?:\?|$)/],
    },
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: buildHttpSecurityHeaders({
        nodeEnvironment: process.env.NODE_ENV,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      }),
    }];
  },
};

export default nextConfig;
