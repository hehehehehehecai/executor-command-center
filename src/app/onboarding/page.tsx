import { cookies } from "next/headers";
import Link from "next/link";

import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let authenticated = false;

  try {
    const environment = parseServerEnvironment(process.env);
    const client = createSupabaseServerClient({
      environment,
      cookieStore: await cookies(),
      responseHeaders: new Headers(),
    });
    const { data, error } = await client.auth.getUser();
    authenticated = !error && Boolean(data.user);
  } catch {
    authenticated = false;
  }

  return (
    <main className="auth-status-shell">
      <p className="section-kicker">GitHub identity</p>
      <h1>{authenticated ? "GitHub 身份登录成功" : "尚未登录"}</h1>
      <dl className="auth-state-list">
        <div><dt>authenticated</dt><dd>{String(authenticated)}</dd></div>
        <div><dt>github_app_installation</dt><dd>not_registered</dd></div>
        <div><dt>repository_access</dt><dd>none</dd></div>
        <div><dt>selected_repositories</dt><dd>none</dd></div>
      </dl>
      <p>尚未连接 GitHub App。仓库只读授权将在后续 Phase 单独完成。</p>
      <Link href="/">返回 Command Deck</Link>
    </main>
  );
}
