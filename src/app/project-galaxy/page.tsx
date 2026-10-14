import { createProjectGalaxyProductionConnectedPort } from "@/app/connected-panel-dependencies";
import { ProjectGalaxyPanel, ProjectLifecycleActions, RepositoryRemovalPanel, createProjectGalaxyConnectedQuery, createProjectGalaxyPreviewQuery, type ProjectGalaxyConnectedPort } from "@/features/project-galaxy";
import { readWorkspaceEntry } from "@/infrastructure/workspace/workspace-entry";
import { WorkspaceEntryStatus, WorkspacePanelFrame } from "@/features/command-deck/workspace-entry-frame";
import { workspaceHref, type WorkspaceSearchParams } from "@/shared/workspace-navigation";

export const dynamic = "force-dynamic";

export default async function ProjectGalaxyPage(input: {
  readonly searchParams: Promise<WorkspaceSearchParams>;
  readonly now?: () => string;
  readonly connectedPort?: ProjectGalaxyConnectedPort;
}) {
  const context = await readWorkspaceEntry("project-galaxy", await input.searchParams);
  const { entry } = context;
  if (entry.kind !== "ready" && entry.kind !== "preview") return <WorkspaceEntryStatus context={context} />;
  const mode = entry.kind === "preview" ? "preview" : "connected";
  const projectId = entry.kind === "ready" ? entry.project.id : null;
  const returnHref = workspaceHref("home", { projectId, mode: mode === "preview" ? "preview" : undefined });
  const result = await Promise.resolve().then(async () => {
    const query = mode === "preview"
      ? createProjectGalaxyPreviewQuery((await import("./project-galaxy-preview-source")).loadProjectGalaxyPreviewSource)
      : createProjectGalaxyConnectedQuery(input.connectedPort ?? (context.fixtureSession
          ? { load: async () => context.fixtureSession!.projectGalaxy }
          : await createProjectGalaxyProductionConnectedPort(projectId, input.now)));
    const viewModel = await query.load();
    if (mode === "connected" && viewModel.project.id !== projectId) throw new Error("connected_panel_not_found");
    return { kind: "success", viewModel } as const;
  }).catch((error: unknown) => ({ kind: "failure", error }) as const);
  if (result.kind === "failure") {
    const code = result.error instanceof Error ? result.error.message : "";
    if (code === "connected_panel_unauthenticated") return <WorkspaceEntryStatus context={{ ...context, workspace: { status: "signed_out", reason: "invalid_session" }, entry: { ...entry, kind: "sign_in" } }} />;
    return <WorkspaceEntryStatus context={{ ...context, entry: { ...entry, kind: code === "connected_panel_not_found" ? "not_found" : "unavailable", reason: code === "connected_panel_not_found" ? "没有可显示的项目" : mode === "preview" ? "演示数据暂时不可用。" : "项目数据暂时不可用。" } }} />;
  }
  const { viewModel } = result;
  return <WorkspacePanelFrame context={context}><main id="main-content" tabIndex={-1}>
    <ProjectGalaxyPanel viewModel={viewModel} returnHref={returnHref} />
    {mode === "connected" ? <><ProjectLifecycleActions projectId={viewModel.project.id} /><RepositoryRemovalPanel projectId={viewModel.project.id} /></> : null}
  </main></WorkspacePanelFrame>;
}
