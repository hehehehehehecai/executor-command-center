import "server-only";
import { cookies } from "next/headers";
import { LoadInstallationManagement } from "@/application/github-installation/load-installation-management";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { GitHubAppInstallationReaderAdapter } from "@/infrastructure/github/github-app-installation-reader";
import { GitHubAppJwtSigner } from "@/infrastructure/github/github-app-jwt";
import { handleInstallationManagement } from "@/infrastructure/github/installation-management-http";
import { SupabaseInstallationManagementContext } from "@/infrastructure/github/supabase-installation-management-context";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export async function installationManagementRoute(request: Request, operation: "current" | "manage") {
  const responseHeaders = new Headers();
  const response = await handleInstallationManagement({ request, operation, trustedOrigin: process.env.APP_ORIGIN, execute: async () => {
    const client = createSupabaseServerClient({
      environment: { APP_ORIGIN: process.env.APP_ORIGIN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      cookieStore: await cookies(), responseHeaders,
    });
    return new LoadInstallationManagement({
      sessionReader: new SupabaseVerifiedSessionReader(client),
      contextReader: new SupabaseInstallationManagementContext(client),
      configuredAppId: process.env.GITHUB_APP_ID ?? "",
      installationReader: { async getInstallation(installationId) {
        let environment;
        try { environment = parseServerEnvironment(process.env); } catch { throw new Error("github_app_configuration_missing"); }
        if (!environment.GITHUB_APP_ID || !environment.GITHUB_APP_PRIVATE_KEY || !environment.GITHUB_REST_API_VERSION) throw new Error("github_app_configuration_missing");
        const privateKey = environment.GITHUB_APP_PRIVATE_KEY;
        return new GitHubAppInstallationReaderAdapter({
          jwtSigner: new GitHubAppJwtSigner({ appId: environment.GITHUB_APP_ID, privateKeyProvider: () => privateKey, clock: { now: () => new Date() } }),
          restApiVersion: environment.GITHUB_REST_API_VERSION,
        }).getInstallation(installationId);
      } },
    }).execute();
  } });
  responseHeaders.forEach((value, name) => response.headers.set(name, value));
  return response;
}
