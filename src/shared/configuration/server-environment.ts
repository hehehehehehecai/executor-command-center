import {
  parseEnvironment,
  type EnvironmentConfiguration,
} from "./environment-contract";

export function parseServerEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): EnvironmentConfiguration {
  return parseEnvironment({
    APP_ORIGIN: source.APP_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    GITHUB_APP_ID: source.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: source.GITHUB_APP_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET: source.GITHUB_WEBHOOK_SECRET,
    INNGEST_EVENT_KEY: source.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: source.INNGEST_SIGNING_KEY,
    DEEPSEEK_API_KEY: source.DEEPSEEK_API_KEY,
  });
}
