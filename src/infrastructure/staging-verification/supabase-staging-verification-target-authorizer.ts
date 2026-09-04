import "server-only";

import { z } from "zod";

import type { StagingVerificationTarget } from "@/application/staging-verification/staging-verification";

type QueryResult = { readonly data: unknown; readonly error: unknown };
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  limit(value: number): FilterQuery & PromiseLike<QueryResult>;
};
type Table = "projects" | "selected_repositories" | "github_installations";
export type StagingVerificationSessionClient = {
  from(table: Table): { select(columns: string): FilterQuery };
};

const uuid = z.string().uuid();
const projectRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  selected_repository_id: uuid,
}).strict()).max(1);
const repositoryRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  github_installation_id: uuid,
  github_repository_id: z.number().int().positive(),
  full_name: z.string().regex(/^[^\s/]+\/[^\s/]+$/),
}).strict()).max(1);
const installationRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  installation_id: z.number().int().positive(),
  status: z.enum(["active", "suspended", "revoked"]),
  suspended_at: z.string().datetime().nullable(),
  revoked_at: z.string().datetime().nullable(),
}).strict()).max(1);

function denied(): never {
  throw new Error("staging_verification_forbidden");
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

export class SupabaseStagingVerificationTargetAuthorizer {
  constructor(private readonly client: StagingVerificationSessionClient) {}

  async assertTarget(input: {
    readonly userId: string;
    readonly expected: StagingVerificationTarget;
  }) {
    if (!uuid.safeParse(input.userId).success || !uuid.safeParse(input.expected.projectId).success) {
      return denied();
    }
    const projects = projectRows.safeParse(await execute(
      this.client.from("projects").select("id,user_id,selected_repository_id")
        .eq("id", input.expected.projectId)
        .eq("user_id", input.userId)
        .limit(1),
    ));
    const project = projects.success ? projects.data[0] : null;
    if (!project) return denied();

    const repositories = repositoryRows.safeParse(await execute(
      this.client.from("selected_repositories")
        .select("id,user_id,github_installation_id,github_repository_id,full_name")
        .eq("id", project.selected_repository_id)
        .eq("user_id", input.userId)
        .eq("full_name", input.expected.repositoryFullName)
        .limit(1),
    ));
    const repository = repositories.success ? repositories.data[0] : null;
    if (!repository) return denied();

    const installations = installationRows.safeParse(await execute(
      this.client.from("github_installations")
        .select("id,user_id,installation_id,status,suspended_at,revoked_at")
        .eq("id", repository.github_installation_id)
        .eq("user_id", input.userId)
        .eq("installation_id", input.expected.installationId)
        .limit(1),
    ));
    const installation = installations.success ? installations.data[0] : null;
    if (
      !installation
      || installation.status !== "active"
      || installation.suspended_at !== null
      || installation.revoked_at !== null
    ) {
      return denied();
    }
    return {
      ...input.expected,
      repositoryId: repository.github_repository_id,
    };
  }
}
