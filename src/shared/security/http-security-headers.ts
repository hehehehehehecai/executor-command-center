export const httpSecurityHeadersContract = "http-security-headers.v1" as const;

function supabaseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") return [];
    return [url.origin, `wss://${url.host}`];
  } catch {
    return [];
  }
}

export function buildHttpSecurityHeaders(input: {
  readonly nodeEnvironment: string | undefined;
  readonly supabaseUrl: string | undefined;
  readonly nonce?: string;
}): { key: string; value: string }[] {
  const production = input.nodeEnvironment === "production";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    input.nonce
      ? `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'`
      : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${["'self'", ...supabaseOrigins(input.supabaseUrl)].join(" ")}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ];
  return [
    ...(input.nonce ? [{ key: "Content-Security-Policy", value: directives.join("; ") }] : []),
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

export function buildContentSecurityPolicy(input: {
  readonly nonce: string;
  readonly nodeEnvironment: string | undefined;
  readonly supabaseUrl: string | undefined;
}): string {
  const header = buildHttpSecurityHeaders(input)
    .find(({ key }) => key === "Content-Security-Policy");
  if (!header) throw new Error("http_security_nonce_missing");
  return header.value;
}
