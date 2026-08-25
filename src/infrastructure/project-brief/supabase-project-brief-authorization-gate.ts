import "server-only";

import type { ProjectBriefAuthorizationGate } from "@/application/project-brief/generate-project-brief";
import { z } from "zod";

type QueryResult = { readonly data: unknown; readonly error: unknown };
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  limit(value: number): FilterQuery & PromiseLike<QueryResult>;
};
type Table = "projects" | "selected_repositories" | "github_installations";
export type ProjectBriefAuthorizationSessionClient = {
  from(table: Table): { select(columns: string): FilterQuery };
};

const uuid = z.string().uuid();
const projectRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  selected_repository_id: uuid,
}).strict()).max(1);
const selectionRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  github_installation_id: uuid,
}).strict()).max(1);
const installationRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  status: z.enum(["active", "suspended", "revoked"]),
}).strict()).max(1);

function denied(): never {
  throw new Error("project_brief_authorization_failed");
}

async function execute(query: unknown): Promise<unknown> {
  try {
    const result = await (query as PromiseLike<QueryResult>);
    if (result.error) return denied();
    return result.data;
  } catch {
    return denied();
  }
}

export class SupabaseProjectBriefAuthorizationGate
implements ProjectBriefAuthorizationGate {
  constructor(private readonly client: ProjectBriefAuthorizationSessionClient) {}

  async assertActive(input: {
    readonly actorUserId: string;
    readonly projectId: string;
  }): Promise<void> {
    if (!uuid.safeParse(input.actorUserId).success || !uuid.safeParse(input.projectId).success) {
      return denied();
    }
    const projects = projectRows.safeParse(await execute(
      this.client.from("projects").select("id,user_id,selected_repository_id")
        .eq("user_id", input.actorUserId).eq("id", input.projectId).limit(1),
    ));
    const project = projects.success ? projects.data[0] : null;
    if (!project) return denied();

    const selections = selectionRows.safeParse(await execute(
      this.client.from("selected_repositories").select("id,user_id,github_installation_id")
        .eq("user_id", input.actorUserId).eq("id", project.selected_repository_id).limit(1),
    ));
    const selection = selections.success ? selections.data[0] : null;
    if (!selection) return denied();

    const installations = installationRows.safeParse(await execute(
      this.client.from("github_installations").select("id,user_id,status")
        .eq("user_id", input.actorUserId).eq("id", selection.github_installation_id).limit(1),
    ));
    if (!installations.success || installations.data[0]?.status !== "active") return denied();
  }
}
