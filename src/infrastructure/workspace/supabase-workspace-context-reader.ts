import "server-only";
import { z } from "zod";
import { projectBackgroundSchema } from "@/domain/project-calibration/project-calibration-read";
import type { SupabaseAuthUserSnapshot } from "@/application/auth/github-provider-identity-mapper";
import type { VerifiedWorkspaceSession, WorkspaceContextReader } from "@/application/workspace/load-workspace-context";

type Result = { readonly data: unknown; readonly error: unknown };
type Query = PromiseLike<Result> & { eq(column: string, value: string): Query; order(column: string, options: { ascending: boolean }): Query; range(from: number, to: number): Query };
export interface WorkspaceSessionClient {
  readonly auth: { getUser(): Promise<{ data: { user: SupabaseAuthUserSnapshot | null }; error: unknown }> };
  from(table: string): { select(columns: string): Query };
}

export function invalidWorkspaceSession(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; code?: unknown };
  return value.name === "AuthSessionMissingError" || ["bad_jwt", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "user_not_found", "session_expired"].includes(String(value.code));
}

const identityRows = z.array(z.object({ user_id: z.string().uuid(), github_login: z.string().trim().min(1).max(255), avatar_url: z.string().url().nullable() })).max(1);
const installationRows = z.array(z.object({ user_id: z.string().uuid(), status: z.enum(["active", "suspended", "revoked"]) })).max(1);
const projectRows = z.array(z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), status: projectBackgroundSchema.shape.status,
  selected_repositories: z.object({ user_id: z.string().uuid(), full_name: z.string().min(1), github_installations: z.object({ user_id: z.string().uuid(), status: z.enum(["active", "suspended", "revoked"]) }) }),
}));

async function rows<T>(query: Query, schema: z.ZodType<T>): Promise<T> {
  const result = await query;
  if (result.error) throw new Error("workspace_read_failed");
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw new Error("workspace_read_failed");
  return parsed.data;
}
function own(actual: string, expected: string) {
  if (actual !== expected) throw new Error("workspace_owner_mismatch");
}

export class SupabaseWorkspaceContextReader implements WorkspaceContextReader {
  constructor(private readonly client: WorkspaceSessionClient, private readonly hasSessionCookie = true) {}

  async verifySession(): Promise<VerifiedWorkspaceSession> {
    if (!this.hasSessionCookie) return { status: "signed_out", reason: "missing_session" };
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error) return invalidWorkspaceSession(error)
        ? { status: "signed_out", reason: "invalid_session" }
        : { status: "unavailable", reason: "verification_failed" };
      if (!data.user || !z.string().uuid().safeParse(data.user.id).success) return { status: "signed_out", reason: "invalid_session" };
      return { status: "verified", user: data.user };
    } catch { return { status: "unavailable", reason: "verification_failed" }; }
  }

  async readIdentity(userId: string) {
    const result = await rows(this.client.from("github_identities").select("user_id,github_login,avatar_url").eq("user_id", userId), identityRows);
    if (!result[0]) throw new Error("workspace_identity_unavailable");
    own(result[0].user_id, userId);
    return { login: result[0].github_login, avatarUrl: result[0].avatar_url };
  }

  async readInstallation(userId: string) {
    const result = await rows(this.client.from("github_installations").select("user_id,status").eq("user_id", userId), installationRows);
    if (!result[0]) return null;
    own(result[0].user_id, userId);
    return { status: result[0].status };
  }

  async readProjects(userId: string) {
    const projects: Array<{ id: string; name: string; status: z.infer<typeof projectRows>[number]["status"] }> = [];
    const seen = new Set<string>();
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const result = await rows(this.client.from("projects").select("id,user_id,status,selected_repositories!inner(user_id,full_name,github_installations!inner(user_id,status))").eq("user_id", userId).order("id", { ascending: true }).range(offset, offset + pageSize - 1), projectRows);
      if (result.length > pageSize) throw new Error("workspace_read_failed");
      for (const row of result) {
        own(row.user_id, userId);
        own(row.selected_repositories.user_id, userId);
        own(row.selected_repositories.github_installations.user_id, userId);
        if (row.selected_repositories.github_installations.status !== "active") throw new Error("workspace_installation_inactive");
        if (seen.has(row.id)) throw new Error("workspace_read_failed");
        seen.add(row.id);
        projects.push({ id: row.id, name: row.selected_repositories.full_name, status: row.status });
      }
      if (result.length < pageSize) return projects;
    }
  }
}
