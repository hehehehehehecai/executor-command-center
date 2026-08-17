import { cookies } from "next/headers";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadProjectGalaxyPreviewFixture } from "@/content/demo-data/project-galaxy-preview-fixture";
import {
  ProjectGalaxyPanel,
  createProjectGalaxyConnectedQuery,
  createProjectGalaxyPreviewQuery,
  type ProjectGalaxySource,
} from "@/features/project-galaxy";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import type { Database } from "@/infrastructure/database/database.types";
import {
  SupabaseProjectFreshnessReader,
  type ProjectFreshnessSessionClient,
} from "@/infrastructure/synchronization/supabase-project-freshness-reader";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";
import { parsePanelMode, type PanelMode } from "@/shared/panel-query";
import { readConnectedPanelFixtureAccess } from "@/testing/connected-panels/connected-panel-fixture-session";

export const dynamic = "force-dynamic";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class ProjectGalaxyNotFoundError extends Error {
  constructor() {
    super("project_galaxy_not_found");
    this.name = "ProjectGalaxyNotFoundError";
  }
}

function projectParameter(
  value: string | string[] | undefined,
): string | null | "invalid" {
  if (value === undefined) return null;
  if (typeof value !== "string" || !uuid.test(value)) return "invalid";
  return value;
}

function requestedMode(
  value: string | string[] | undefined,
): PanelMode | "invalid" {
  if (value === undefined) return "preview";
  if (typeof value !== "string") return "invalid";

  try {
    return parsePanelMode(value);
  } catch {
    return "invalid";
  }
}

function statusShell(content: React.ReactNode) {
  return <main className="auth-status-shell">{content}</main>;
}

function connectedSource(input: {
  readonly projectId: string;
  readonly freshness: ProjectGalaxySource["freshness"];
}): ProjectGalaxySource {
  return {
    project: {
      id: input.projectId,
      name: null,
      repositoryLabel: null,
    },
    officialStatus: null,
    suggestedStatus: null,
    activity: [],
    freshness: input.freshness,
    coreGoal: null,
    currentStageGoal: null,
    currentBlockers: [],
    provenanceLabel: "真实项目数据",
  };
}

export default async function ProjectGalaxyPage(input: {
  readonly searchParams: Promise<{
    readonly mode?: string | string[];
    readonly project?: string | string[];
  }>;
  readonly now?: () => string;
}) {
  const searchParams = await input.searchParams;
  const mode = requestedMode(searchParams.mode);

  if (mode === "invalid") {
    return statusShell(
      <>
        <h1>Project Galaxy</h1>
        <p>面板模式无效。</p>
      </>,
    );
  }

  if (mode === "preview") {
    const previewResult = await createProjectGalaxyPreviewQuery(
      loadProjectGalaxyPreviewFixture,
    )
      .load()
      .then((viewModel) => ({ kind: "success", viewModel }) as const)
      .catch(() => ({ kind: "failure" }) as const);

    if (previewResult.kind === "failure") {
      return statusShell(
        <>
          <h1>Project Galaxy</h1>
          <p>演示数据暂时不可用。</p>
        </>,
      );
    }

    return <ProjectGalaxyPanel viewModel={previewResult.viewModel} />;
  }

  const projectId = projectParameter(searchParams.project);
  if (projectId === "invalid") {
    return statusShell(
      <>
        <h1>Project Galaxy</h1>
        <p>没有可显示的项目</p>
      </>,
    );
  }

  const fixtureAccess = await readConnectedPanelFixtureAccess(
    projectId ?? undefined,
  );
  if (fixtureAccess.kind === "denied") {
    return statusShell(
      <>
        <p className="section-kicker">Project Galaxy</p>
        <h1>Project Galaxy</h1>
        <p>没有可显示的项目</p>
      </>,
    );
  }

  if (fixtureAccess.kind === "authorized") {
    const fixtureResult = await createProjectGalaxyConnectedQuery({
      load: async () => fixtureAccess.session.projectGalaxy,
    })
      .load()
      .then((viewModel) => ({ kind: "success", viewModel }) as const)
      .catch(() => ({ kind: "failure" }) as const);

    if (fixtureResult.kind === "failure") {
      return statusShell(
        <>
          <h1>Project Galaxy</h1>
          <p>项目数据暂时不可用。</p>
        </>,
      );
    }

    return <ProjectGalaxyPanel viewModel={fixtureResult.viewModel} />;
  }

  let client: SupabaseClient<Database>;
  try {
    client = createSupabaseServerClient<SupabaseClient<Database>>({
      environment: parseServerEnvironment(process.env),
      cookieStore: await cookies(),
      responseHeaders: new Headers(),
    });
  } catch {
    return statusShell(
      <>
        <h1>Project Galaxy</h1>
        <p>项目数据暂时不可用。</p>
      </>,
    );
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return statusShell(
      <>
        <p className="section-kicker">Project Galaxy</p>
        <h1>需要登录</h1>
        <p>登录后可查看你的真实项目 Freshness。</p>
        <Link href="/api/auth/github?returnTo=%2Fproject-galaxy%3Fmode%3Dconnected">
          使用 GitHub 登录
        </Link>
      </>,
    );
  }

  const query = createProjectGalaxyConnectedQuery({
    load: async () => {
      const result = await new SupabaseProjectFreshnessReader(
        client as unknown as ProjectFreshnessSessionClient,
      ).read({
        userId: data.user.id,
        projectId,
        now: input.now?.() ?? new Date().toISOString(),
      });

      if (result === null) {
        throw new ProjectGalaxyNotFoundError();
      }

      return connectedSource({
        projectId: result.projectId,
        freshness: { kind: "known", input: result.input },
      });
    },
  });

  const connectedResult = await query
    .load()
    .then((viewModel) => ({ kind: "success", viewModel }) as const)
    .catch((failure: unknown) => ({ kind: "failure", failure }) as const);

  if (connectedResult.kind === "failure") {
    if (connectedResult.failure instanceof ProjectGalaxyNotFoundError) {
      return statusShell(
        <>
          <p className="section-kicker">Project Galaxy</p>
          <h1>Project Galaxy</h1>
          <p>没有可显示的项目</p>
        </>,
      );
    }

    return statusShell(
      <>
        <h1>Project Galaxy</h1>
        <p>项目数据暂时不可用。</p>
      </>,
    );
  }

  return <ProjectGalaxyPanel viewModel={connectedResult.viewModel} />;
}
