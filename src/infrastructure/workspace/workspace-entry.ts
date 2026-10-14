import "server-only";
import { cookies } from "next/headers";
import type { WorkspaceContext } from "@/application/workspace/load-workspace-context";
import { resolveWorkspaceEntry, type WorkspaceEntry } from "@/application/workspace/resolve-workspace-entry";
import { validateWorkspaceQuery, workspaceProjectParameter, type WorkspaceDestination, type WorkspaceSearchParams } from "@/shared/workspace-navigation";
import { readConnectedPanelFixtureAccess } from "@/testing/connected-panels/connected-panel-fixture-session";
import type { ConnectedPanelFixtureSession } from "@/testing/connected-panels/connected-panel-fixture";
import { readWorkspaceContext } from "./workspace-server-context";

export function controlledWorkspacePreviewAllowed(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") return false;
  if (environment.WORKSPACE_PREVIEW_E2E !== "1") return false;
  try {
    const origin = new URL(environment.APP_ORIGIN ?? "");
    return ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) && ["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/";
  } catch { return false; }
}

export type WorkspaceEntryContext = {
  readonly workspace: WorkspaceContext;
  readonly entry: WorkspaceEntry;
  readonly controlledFixture: boolean;
  readonly fixtureSession: ConnectedPanelFixtureSession | null;
};

export async function readWorkspaceEntry(target: WorkspaceDestination, searchParams: WorkspaceSearchParams): Promise<WorkspaceEntryContext> {
  const signedOut = { status: "signed_out", reason: "missing_session" } as const;
  const resolve = (workspace: WorkspaceContext) => resolveWorkspaceEntry({ target, searchParams, workspace, previewAllowed: controlledWorkspacePreviewAllowed() });
  const preliminary = resolve(signedOut);
  if (preliminary.kind === "preview") return { workspace: await readWorkspaceContext(), entry: preliminary, controlledFixture: true, fixtureSession: null };
  if (preliminary.kind === "invalid") return { workspace: await readWorkspaceContext(), entry: preliminary, controlledFixture: false, fixtureSession: null };
  const requested = workspaceProjectParameter(target, searchParams);
  const fixtureCookie = process.env.NODE_ENV !== "production" && process.env.CONNECTED_PANEL_E2E === "1"
    ? (await cookies()).get("connected-panel-verified-user")?.value
    : undefined;
  if (fixtureCookie && validateWorkspaceQuery(target, searchParams) && requested !== "invalid") {
    const access = await readConnectedPanelFixtureAccess(requested ?? undefined);
    if (access.kind === "denied") return { workspace: signedOut, entry: { ...preliminary, kind: "not_found", reason: "没有可显示的项目" }, controlledFixture: true, fixtureSession: null };
    if (access.kind === "authorized") {
      const name = access.session.projectGalaxy.project.name ?? access.session.projectGalaxy.project.repositoryLabel ?? "当前已接入项目";
      const workspace: WorkspaceContext = { status: "authenticated", userId: access.session.userId,
        identity: { status: "ready", data: { login: name, avatarUrl: null } },
        installation: { status: "ready", data: { status: "active" } }, projects: { status: "ready", data: [{ id: access.session.projectId, name, status: access.session.projectGalaxy.officialStatus }] } };
      return { workspace, entry: resolve(workspace), controlledFixture: true, fixtureSession: access.session };
    }
  }
  const workspace = await readWorkspaceContext();
  return { workspace, entry: resolve(workspace), controlledFixture: false, fixtureSession: null };
}
