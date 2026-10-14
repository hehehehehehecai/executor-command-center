import { CommandDeckPage } from "@/features/command-deck";
import { readWorkspaceEntry } from "@/infrastructure/workspace/workspace-entry";
import { WorkspaceEntryStatus } from "@/features/command-deck/workspace-entry-frame";
import { WorkspaceSessionBoundary } from "@/features/onboarding/workspace-session-boundary";
import type { WorkspaceSearchParams } from "@/shared/workspace-navigation";
import { createCommandDeckProductionConnectedPort } from "@/app/connected-panel-dependencies";
import { loadCommandDeckOverview, type CommandDeckOverview } from "@/features/command-deck/command-deck-connected-query";

export const dynamic = "force-dynamic";

export default async function Home(input: { readonly searchParams?: Promise<WorkspaceSearchParams> } = {}) {
  const context = await readWorkspaceEntry("home", await input.searchParams ?? {});
  const { entry, workspace } = context;
  if (entry.kind === "preview") {
    const { CommandDeckPreviewPage } = await import("@/features/command-deck/command-deck-preview-page");
    return <WorkspaceSessionBoundary workspace={workspace}><CommandDeckPreviewPage workspace={workspace} /></WorkspaceSessionBoundary>;
  }
  if (entry.kind === "invalid" || entry.kind === "not_found" || entry.kind === "revoked") return <WorkspaceEntryStatus context={context} />;
  let overview: CommandDeckOverview | undefined;
  if (entry.kind === "ready" && workspace.status === "authenticated" && !context.controlledFixture) {
    try {
      overview = await loadCommandDeckOverview(await createCommandDeckProductionConnectedPort(entry.project.id, workspace.userId), { userId: workspace.userId, projectId: entry.project.id });
    } catch { overview = { kind: "failed" }; }
  }
  const content = <CommandDeckPage workspace={workspace} projectId={entry.kind === "ready" ? entry.project.id : null} overview={overview} />;
  return context.controlledFixture ? content : <WorkspaceSessionBoundary workspace={workspace} preserveWorkspaceQuery>{content}</WorkspaceSessionBoundary>;
}
