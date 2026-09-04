export const rateLimitContract = "rate-limit.v1" as const;

export type RateLimitScope =
  | "project_brief_generate"
  | "project_brief_follow_up"
  | "project_sync_mutation"
  | "destructive_mutation"
  | "project_configuration_mutation"
  | "github_repository_mutation"
  | "github_expensive_read";

export interface RateLimitPolicy {
  readonly scope: RateLimitScope;
  readonly limit: number;
  readonly windowSeconds: number;
}

const project = "[0-9a-f-]{36}";
const brief = "[0-9a-f-]{36}";

export function rateLimitPolicyForRequest(method: string, pathname: string): RateLimitPolicy | null {
  const verb = method.toUpperCase();
  if (verb === "POST" && new RegExp(`^/api/projects/${project}/briefs/generate$`, "i").test(pathname)) {
    return { scope: "project_brief_generate", limit: 5, windowSeconds: 60 };
  }
  if (verb === "POST" && pathname === "/api/staging-verification/provider-failure-retry") {
    return { scope: "project_brief_generate", limit: 5, windowSeconds: 60 };
  }
  if (verb === "POST" && new RegExp(`^/api/projects/${project}/briefs/${brief}/follow-up$`, "i").test(pathname)) {
    return { scope: "project_brief_follow_up", limit: 20, windowSeconds: 60 };
  }
  if (verb === "POST" && new RegExp(`^/api/projects/${project}/(?:first-sync|resync)$`, "i").test(pathname)) {
    return { scope: "project_sync_mutation", limit: 10, windowSeconds: 60 };
  }
  if (
    verb === "POST"
    && /^\/api\/staging-verification\/(?:webhook-replay|reconciliation)$/.test(pathname)
  ) {
    return { scope: "project_sync_mutation", limit: 10, windowSeconds: 60 };
  }
  if (
    (verb === "POST" && new RegExp(`^/api/projects/${project}/repository-removal$`, "i").test(pathname))
    || (["POST", "DELETE"].includes(verb) && pathname === "/api/account-deletion")
  ) {
    return { scope: "destructive_mutation", limit: 3, windowSeconds: 3_600 };
  }
  if (verb === "POST" && pathname === "/api/projects") {
    return { scope: "project_configuration_mutation", limit: 30, windowSeconds: 60 };
  }
  if (
    (verb === "POST" && pathname === "/api/github/repository-selections")
    || (verb === "DELETE" && /^\/api\/github\/repository-selections\/[1-9][0-9]*$/.test(pathname))
    || (verb === "GET" && /^\/api\/github\/installations\/(?:start|setup)$/.test(pathname))
  ) {
    return { scope: "github_repository_mutation", limit: 20, windowSeconds: 60 };
  }
  if (verb === "GET" && pathname === "/api/github/repositories") {
    return { scope: "github_expensive_read", limit: 30, windowSeconds: 60 };
  }
  return null;
}
