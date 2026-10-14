import { vi } from "vitest";

// External transport for inherited panel composition tests. The actual server
// WorkspaceContextReader and browser WorkspaceSessionBoundary still execute.
const actorId = "11111111-1111-4111-8111-111111111111";
let ownedProjectIds = ["22222222-2222-4222-8222-222222222222"];

export function workspaceEntryCookies() {
  return {
    getAll: () => [{ name: "sb-composition-auth-token", value: "synthetic-external-transport" }],
    get: () => undefined,
    set: () => undefined,
  };
}

export function workspaceEntryClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: actorId } }, error: null }) },
    from: (table: string) => ({ select: () => {
      const filters: [string, string][] = [];
      let range: readonly [number, number] | null = null;
      const query = {
        eq: (key: string, value: string) => { filters.push([key, value]); return query; },
        order: () => query,
        range: (from: number, to: number) => { range = [from, to]; return query; },
        then: (resolve: (value: unknown) => unknown) => {
          const actorMatches = filters.some(([key, value]) => key === "user_id" && value === actorId);
          const data = !actorMatches ? []
            : table === "github_identities" ? [{ user_id: actorId, github_login: "composition-captain", avatar_url: null }]
            : table === "github_installations" ? [{ user_id: actorId, status: "active" }]
            : table === "projects" ? ownedProjectIds.map(id => ({
              id, user_id: actorId, status: null,
              selected_repositories: {
                user_id: actorId, full_name: `composition/project-${id.slice(0, 8)}`,
                github_installations: { user_id: actorId, status: "active" },
              },
            })) : [];
          return Promise.resolve({ data: range ? data.slice(range[0], range[1] + 1) : data, error: null }).then(resolve);
        },
      };
      return query;
    } }),
  };
}

export async function workspaceEntryResponse() {
  const { readWorkspaceContext } = await import("@/infrastructure/workspace/workspace-server-context");
  return Response.json({ workspace: await readWorkspaceContext() });
}

export function installWorkspaceEntryTransport(projectIds?: readonly string[]) {
  ownedProjectIds = [...(projectIds ?? ["22222222-2222-4222-8222-222222222222"])];
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3017");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://composition-transport.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
  vi.stubEnv("CONNECTED_PANEL_E2E", undefined);
  vi.stubEnv("WORKSPACE_PREVIEW_E2E", "1");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
    if ((init?.method ?? "GET") !== "GET") throw new Error("composition_transport_unexpected_write");
    const path = String(input);
    if (path === "/api/auth/workspace") return workspaceEntryResponse();
    const projectId = path.match(/^\/api\/projects\/([^/]+)\/sync-status$/)?.[1];
    if (projectId && ownedProjectIds.includes(projectId)) return Response.json({ sync: {
      contractVersion: "project-onboarding-sync.v1", projectId, state: "not_started",
      syncRunId: null, queuedAt: null, finishedAt: null, retryRequestId: "onboarding",
    } });
    throw new Error(`composition_transport_unexpected_read:${path}`);
  }));
}
