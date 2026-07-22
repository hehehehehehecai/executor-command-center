import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type SessionClient = {
  readonly auth: {
    getUser(): Promise<unknown>;
  };
};

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
  readonly environment: Readonly<{
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  }>;
  readonly createClient?: SessionClientFactory;
}) {
  const supabaseUrl = input.environment.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = input.environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request: input.request });
  }

  let response = NextResponse.next({ request: input.request });
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
        response = NextResponse.next({ request: input.request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  await client.auth.getUser();
  return response;
}
