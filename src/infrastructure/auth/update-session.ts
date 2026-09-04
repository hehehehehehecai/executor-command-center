import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { rateLimitPolicyForRequest } from "@/shared/security/rate-limit-policy";
import { safeHttpErrorResponse } from "@/shared/security/safe-http-error";

type SessionClient = {
  readonly auth: {
    getUser(): Promise<unknown>;
  };
  readonly rpc?: (name: string, input: Record<string, unknown>) => Promise<unknown>;
};

type RateLimitRow = {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retry_after_seconds: number;
};

function rateLimitRow(value: unknown): RateLimitRow | null {
  if (typeof value !== "object" || value === null || !("data" in value)) return null;
  const result = value as { data?: unknown; error?: unknown };
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return null;
  const row = result.data[0];
  if (
    typeof row !== "object" || row === null
    || !("allowed" in row) || typeof row.allowed !== "boolean"
    || !("remaining" in row) || !Number.isSafeInteger(row.remaining) || Number(row.remaining) < 0
    || !("retry_after_seconds" in row) || !Number.isSafeInteger(row.retry_after_seconds) || Number(row.retry_after_seconds) < 1
  ) return null;
  return row as RateLimitRow;
}

function verifiedUserId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("data" in value)) return null;
  const data = (value as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || !("user" in data)) return null;
  const user = (data as { user?: unknown }).user;
  return typeof user === "object" && user !== null && "id" in user && typeof user.id === "string"
    ? user.id
    : null;
}

type SessionClientFactory = (
  url: string,
  key: string,
  options: {
    cookieOptions: CookieOptions;
    cookies: {
      getAll(): { name: string; value: string }[];
      setAll(
        cookies: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
        headers: Record<string, string>,
      ): void;
    };
  },
) => SessionClient;

export async function refreshSupabaseSession(input: {
  readonly request: NextRequest;
  readonly requestHeaders?: Headers;
  readonly environment: Readonly<{
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  }>;
  readonly createClient?: SessionClientFactory;
}) {
  const supabaseUrl = input.environment.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = input.environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({
      request: input.requestHeaders ? { headers: input.requestHeaders } : input.request,
    });
  }

  const forwardedRequest = input.requestHeaders
    ? { headers: input.requestHeaders }
    : input.request;
  let response = NextResponse.next({ request: forwardedRequest });
  const factory =
    input.createClient ??
    (createServerClient as unknown as SessionClientFactory);
  const client = factory(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      secure: input.request.nextUrl.protocol === "https:",
    },
    cookies: {
      getAll: () => input.request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          input.request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: forwardedRequest });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  const authResult = await client.auth.getUser();
  const policy = rateLimitPolicyForRequest(input.request.method, input.request.nextUrl.pathname);
  if (policy && verifiedUserId(authResult)) {
    let decision: RateLimitRow | null = null;
    try {
      decision = client.rpc
        ? rateLimitRow(await client.rpc("consume_beta_rate_limit", { p_scope: policy.scope }))
        : null;
    } catch {
      decision = null;
    }
    if (!decision) {
      return safeHttpErrorResponse({
        error: { code: "rate_limit_unavailable" },
        allowedCodes: ["rate_limit_unavailable"],
        fallbackCode: "rate_limit_unavailable",
        statusByCode: { rate_limit_unavailable: 503 },
        headers: response.headers,
      });
    }
    response.headers.set("x-ratelimit-limit", String(policy.limit));
    response.headers.set("x-ratelimit-remaining", String(decision.remaining));
    if (!decision.allowed) {
      return safeHttpErrorResponse({
        error: { code: "rate_limited" },
        allowedCodes: ["rate_limited"],
        fallbackCode: "rate_limit_unavailable",
        statusByCode: { rate_limited: 429, rate_limit_unavailable: 503 },
        retryAfterSeconds: decision.retry_after_seconds,
        headers: response.headers,
      });
    }
  }
  return response;
}
