import { mapVerifiedGitHubAuthIdentity, type SupabaseAuthUserSnapshot } from "@/application/auth/github-provider-identity-mapper";
import type { ProjectStatus } from "@/domain/project-calibration/project-calibration";

export type WorkspaceIdentity = { readonly login: string; readonly avatarUrl: string | null };
export type WorkspaceInstallation = { readonly status: "active" | "suspended" | "revoked" };
export type WorkspaceProject = { readonly id: string; readonly name: string; readonly status: ProjectStatus | null };
export type WorkspaceRead<T> = { readonly status: "ready"; readonly data: T } | { readonly status: "failed" };
export type VerifiedWorkspaceSession =
  | { readonly status: "verified"; readonly user: SupabaseAuthUserSnapshot }
  | { readonly status: "signed_out"; readonly reason: "missing_session" | "invalid_session" }
  | { readonly status: "unavailable"; readonly reason: "verification_failed" };
export type WorkspaceContext =
  | Exclude<VerifiedWorkspaceSession, { status: "verified" }>
  | { readonly status: "unavailable"; readonly reason: "configuration_missing" }
  | {
    readonly status: "authenticated";
    readonly userId: string;
    readonly identity: WorkspaceRead<WorkspaceIdentity>;
    readonly installation: WorkspaceRead<WorkspaceInstallation | null>;
    readonly projects: WorkspaceRead<readonly WorkspaceProject[]> | { readonly status: "blocked" };
  };
export interface WorkspaceContextReader {
  verifySession(): Promise<VerifiedWorkspaceSession>;
  readIdentity(userId: string): Promise<WorkspaceIdentity>;
  readInstallation(userId: string): Promise<WorkspaceInstallation | null>;
  readProjects(userId: string): Promise<readonly WorkspaceProject[]>;
}

export async function loadWorkspaceContext(reader: WorkspaceContextReader | null): Promise<WorkspaceContext> {
  if (!reader) return { status: "unavailable", reason: "configuration_missing" };
  let session: VerifiedWorkspaceSession;
  try { session = await reader.verifySession(); }
  catch { return { status: "unavailable", reason: "verification_failed" }; }
  if (session.status !== "verified") return session;
  const userId = session.user.id;
  const identity = await safeRead(async () => {
    try {
      const mapped = mapVerifiedGitHubAuthIdentity(session.user);
      return { login: mapped.githubLogin, avatarUrl: mapped.avatarUrl };
    } catch { return reader.readIdentity(userId); }
  });
  const installation = await safeRead(() => reader.readInstallation(userId));
  const projects = installation.status === "failed"
    || (installation.data !== null && installation.data.status !== "active")
    ? { status: "blocked" as const }
    : await safeRead(() => reader.readProjects(userId));
  return { status: "authenticated", userId, identity, installation, projects };
}

async function safeRead<T>(read: () => Promise<T>): Promise<WorkspaceRead<T>> {
  try { return { status: "ready", data: await read() }; }
  catch { return { status: "failed" }; }
}
