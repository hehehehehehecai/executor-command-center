import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";

export const supabaseSessionContractVersion = "supabase-session.v1" as const;
export const supabaseCookieAdapterVersion =
  "supabase-ssr-cookie-adapter.v1" as const;

type PublicSupabaseEnvironment = Readonly<{
  APP_ORIGIN?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}>;

type CookieStore = {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options: CookieOptions): void;
};

type ServerClientOptions = {
  cookieOptions: CookieOptions;
  cookies: {
    getAll(): { name: string; value: string }[];
    setAll(
      cookies: { name: string; value: string; options: CookieOptions }[],
      headers: Record<string, string>,
    ): void;
  };
};

type ServerClientFactory<Client> = (
  url: string,
  key: string,
  options: ServerClientOptions,
) => Client;

export function createSupabaseServerClient<
  Client = ReturnType<typeof createServerClient>,
>(input: {
  readonly environment: PublicSupabaseEnvironment;
  readonly cookieStore: CookieStore;
  readonly responseHeaders: Headers;
  readonly createClient?: ServerClientFactory<Client>;
}): Client {
  const supabaseUrl = input.environment.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = input.environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("auth_configuration_missing");
  }

  const factory =
    input.createClient ??
    (createServerClient as unknown as ServerClientFactory<Client>);

  return factory(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      secure: input.environment.APP_ORIGIN
        ? new URL(input.environment.APP_ORIGIN).protocol === "https:"
        : false,
    },
    cookies: {
      getAll: () => input.cookieStore.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value, options } of cookiesToSet) {
          input.cookieStore.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          input.responseHeaders.set(name, value);
        }
      },
    },
  });
}
