import { describe, expect, it } from "vitest";
import {
  SupabaseProjectBriefEvidenceReader,
  type ProjectBriefEvidenceSessionClient,
} from "./supabase-project-brief-evidence-reader";

const userId = "d3000000-0000-4000-8000-000000000004";
const projectId = "d3100000-0000-4000-8000-000000000004";
const selectedRepositoryId = "d3200000-0000-4000-8000-000000000004";
const installationId = "d3300000-0000-4000-8000-000000000004";

type Table = Parameters<ProjectBriefEvidenceSessionClient["from"]>[0];
type FixtureRows = Partial<Record<Table, unknown>>;

function session(rows: FixtureRows, failingTable?: Table) {
  const filters: Array<{ table: Table; column: string; value: unknown }> = [];
  const client = {
    from(table: Table) {
      const query = {
        select: (columns: string) => {
          void columns;
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters.push({ table, column, value });
          return query;
        },
        limit: (value: number) => {
          void value;
          return query;
        },
        then: <TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) => Promise.resolve({
          data: rows[table] ?? [],
          error: table === failingTable ? { message: "private database detail" } : null,
        }).then(onfulfilled, onrejected),
      };
      return query;
    },
  } as ProjectBriefEvidenceSessionClient;
  return { client, filters };
}

function baseRows(): FixtureRows {
  return {
    projects: [{
      id: projectId,
      user_id: userId,
      selected_repository_id: selectedRepositoryId,
      core_goal: "Synthetic project goal",
      current_stage_goal: "Evidence snapshot",
      status: "in_development",
      current_blocker: null,
      updated_at: "2026-08-07T10:00:00.000Z",
    }],
    selected_repositories: [{
      id: selectedRepositoryId,
      user_id: userId,
      github_installation_id: installationId,
    }],
    github_installations: [{ id: installationId, user_id: userId, status: "active" }],
    github_commits: [{
      project_id: projectId,
      github_object_id: "commit-001",
      source_updated_at: "2026-08-03T10:01:00.000Z",
      source_version: "tree-001",
      message: "Synthetic commit",
      authored_at: "2026-08-03T09:59:00.000Z",
      committed_at: "2026-08-03T10:00:00.000Z",
      author_login: "synthetic-user",
    }],
    github_issues: [{
      project_id: projectId,
      github_object_id: "issue-001",
      source_updated_at: "2026-08-04T10:00:00.000Z",
      source_version: "issue-v1",
      issue_number: 11,
      title: "Synthetic issue",
      state: "open",
      author_login: null,
      closed_at: null,
    }],
    github_pull_requests: [],
    github_releases: [],
    github_workflow_runs: [],
    github_document_snapshots: [{
      project_id: projectId,
      github_object_id: "doc-001",
      source_updated_at: "2026-08-06T10:00:00.000Z",
      source_version: "blob-sha-001",
      document_path: "docs/architecture.md",
      document_kind: "documentation",
      content_fingerprint: `sha256:${"a".repeat(64)}`,
    }],
  };
}

describe("SupabaseProjectBriefEvidenceReader", () => {
  it("reads only an owned project with an active installation and maps metadata-only evidence", async () => {
    const { client, filters } = session(baseRows());
    const result = await new SupabaseProjectBriefEvidenceReader(client).read({ userId, projectId });

    expect(result).toEqual(expect.objectContaining({
      authorizationStatus: "active",
      projectProfile: expect.objectContaining({ userId, projectId, sourceId: projectId }),
      githubActivities: [
        expect.objectContaining({ sourceKind: "github_commit", sourceId: "commit-001" }),
        expect.objectContaining({ sourceKind: "github_issue", sourceId: "issue-001" }),
      ],
      authorizedDocuments: [expect.objectContaining({
        authorized: true,
        path: "docs/architecture.md",
        sourceSha: `sha256:${"a".repeat(64)}`,
      })],
      confirmedDecisionsSourceAvailable: false,
      confirmedDecisions: [],
    }));
    expect(filters).toEqual(expect.arrayContaining([
      { table: "projects", column: "user_id", value: userId },
      { table: "projects", column: "id", value: projectId },
      { table: "selected_repositories", column: "user_id", value: userId },
      { table: "github_installations", column: "user_id", value: userId },
      { table: "github_commits", column: "project_id", value: projectId },
      { table: "github_document_snapshots", column: "project_id", value: projectId },
    ]));
    expect(JSON.stringify(result)).not.toContain("document_body");
  });

  it("fails closed after revoked authorization without reading activity or documents", async () => {
    const rows = baseRows();
    rows.github_installations = [{ id: installationId, user_id: userId, status: "revoked" }];
    const { client, filters } = session(rows);

    const result = await new SupabaseProjectBriefEvidenceReader(client).read({ userId, projectId });

    expect(result).toEqual(expect.objectContaining({
      authorizationStatus: "revoked",
      githubActivities: [],
      authorizedDocuments: [],
      confirmedDecisionsSourceAvailable: false,
      confirmedDecisions: [],
    }));
    expect(filters.some(({ table }) => table === "github_commits")).toBe(false);
  });

  it("returns null when the owned project does not exist", async () => {
    const { client } = session({ projects: [] });
    await expect(new SupabaseProjectBriefEvidenceReader(client).read({ userId, projectId }))
      .resolves.toBeNull();
  });

  it("uses a stable safe failure for malformed rows and database errors", async () => {
    const malformed = baseRows();
    malformed.github_commits = [{ private_payload: "must not escape" }];
    const malformedReader = new SupabaseProjectBriefEvidenceReader(session(malformed).client);
    const failingReader = new SupabaseProjectBriefEvidenceReader(
      session(baseRows(), "github_issues").client,
    );

    await expect(malformedReader.read({ userId, projectId })).rejects.toThrow(
      "project_brief_evidence_read_failed",
    );
    await expect(failingReader.read({ userId, projectId })).rejects.toThrow(
      "project_brief_evidence_read_failed",
    );
  });
});
