import type { NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/infrastructure/auth/update-session";
import { buildContentSecurityPolicy } from "@/shared/security/http-security-headers";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID(), "utf8").toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    nodeEnvironment: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);
  const response = await refreshSupabaseSession({
    request,
    requestHeaders,
    environment: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
