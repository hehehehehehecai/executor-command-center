import { cookies } from "next/headers";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SyncStatusBadge } from "@/features/project-galaxy";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import type { Database } from "@/infrastructure/database/database.types";
import {
  SupabaseProjectFreshnessReader,
  type ProjectFreshnessSessionClient,
} from "@/infrastructure/synchronization/supabase-project-freshness-reader";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function projectParameter(value: string | string[] | undefined): string | null | "invalid" {
  if (value === undefined) return null;
  if (typeof value !== "string" || !uuid.test(value)) return "invalid";
  return value;
}

function shell(content: React.ReactNode) {
  return <main className="auth-status-shell">{content}</main>;
}

export default async function ProjectGalaxyPage(input: {
  readonly searchParams: Promise<{ readonly project?: string | string[] }>;
  readonly now?: () => string;
}) {
  let client: SupabaseClient<Database>;
  try {
    client = createSupabaseServerClient<SupabaseClient<Database>>({
      environment: parseServerEnvironment(process.env),
      cookieStore: await cookies(),
      responseHeaders: new Headers(),
    });
  } catch {
    return shell(<><h1>Project Galaxy</h1><p>项目数据暂时不可用。</p></>);
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return shell(<><p className="section-kicker">Project Galaxy</p><h1>需要登录</h1><p>登录后可查看你的真实项目 Freshness。</p><Link href="/api/auth/github?returnTo=%2Fproject-galaxy">使用 GitHub 登录</Link></>);
  }

  const parameter = projectParameter((await input.searchParams).project);
  if (parameter === "invalid") {
    return shell(<><h1>Project Galaxy</h1><p>没有可显示的项目</p></>);
  }

  let view;
  try {
    view = await new SupabaseProjectFreshnessReader(
      client as unknown as ProjectFreshnessSessionClient,
    ).read({
      userId: data.user.id,
      projectId: parameter,
      now: input.now?.() ?? new Date().toISOString(),
    });
  } catch {
    return shell(<><h1>Project Galaxy</h1><p>项目数据暂时不可用。</p></>);
  }

  if (view === null) {
    return shell(<><p className="section-kicker">Project Galaxy</p><h1>Project Galaxy</h1><p>没有可显示的项目</p></>);
  }

  const latest = view.input.latestRun;
  return shell(
    <>
      <p className="section-kicker">Project Galaxy</p>
      <h1>Project Galaxy</h1>
      <SyncStatusBadge input={view.input} />
      {latest === null ? null : (
        <p>最新 SyncRun：{latest.status} · {latest.id.slice(0, 8)}…</p>
      )}
      <Link href="/">返回 Command Deck</Link>
    </>,
  );
}
