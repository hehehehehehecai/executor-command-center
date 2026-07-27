import { cookies } from "next/headers";
import Link from "next/link";

import {
  GitHubInstallationStatus,
  type GitHubInstallationUiStatus,
} from "@/features/onboarding";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export const dynamic = "force-dynamic";

export default async function OnboardingPage(input: {
  readonly searchParams: Promise<{
    installation?: string | string[];
  }>;
}) {
  let authenticated = false;
  let installationStatus: GitHubInstallationUiStatus = "not_registered";

  try {
    const environment = parseServerEnvironment(process.env);
    const client = createSupabaseServerClient({
      environment,
      cookieStore: await cookies(),
      responseHeaders: new Headers(),
    });
    const { data, error } = await client.auth.getUser();
    authenticated = !error && Boolean(data.user);

    if (authenticated && data.user) {
      const { data: installation, error: installationError } = await client
        .from("github_installations")
        .select("status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (
        !installationError &&
        (installation?.status === "active" ||
          installation?.status === "suspended" ||
          installation?.status === "revoked")
      ) {
        installationStatus = installation.status;
      }
    }
  } catch {
    authenticated = false;
  }

  const searchParams = await input.searchParams;
  if (
    authenticated &&
    installationStatus === "not_registered" &&
    searchParams.installation === "configuration_failed"
  ) {
    installationStatus = "configuration_failed";
  }

  return (
    <main className="auth-status-shell">
      <p className="section-kicker">GitHub identity</p>
      <h1>{authenticated ? "GitHub 身份登录成功" : "尚未登录"}</h1>
      <GitHubInstallationStatus
        authenticated={authenticated}
        installationStatus={installationStatus}
      />
      <Link href="/">返回 Command Deck</Link>
    </main>
  );
}
