import "server-only";
import type { ReactNode } from "react";
import { readWorkspaceContext } from "@/infrastructure/workspace/workspace-server-context";
import { AccountIdentity } from "./account-identity";
import { WorkspaceSessionBoundary } from "./workspace-session-boundary";

export async function WorkspaceFrame({ children }: { readonly children: ReactNode }) {
  const workspace = await readWorkspaceContext();
  return <WorkspaceSessionBoundary key={workspace.status === "authenticated" ? workspace.userId : workspace.status} workspace={workspace}><AccountIdentity workspace={workspace} />{children}</WorkspaceSessionBoundary>;
}
