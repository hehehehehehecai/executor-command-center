import { describe, expect, it } from "vitest";

import { rateLimitPolicyForRequest } from "./rate-limit-policy";

describe("rate-limit.v1 route policy", () => {
  it.each([
    ["POST", "/api/projects/20000000-0000-4000-8000-000000000002/briefs/generate", "project_brief_generate", 5, 60],
    ["POST", "/api/projects/20000000-0000-4000-8000-000000000002/briefs/30000000-0000-4000-8000-000000000003/follow-up", "project_brief_follow_up", 20, 60],
    ["POST", "/api/projects/20000000-0000-4000-8000-000000000002/resync", "project_sync_mutation", 10, 60],
    ["POST", "/api/staging-verification/provider-failure-retry", "project_brief_generate", 5, 60],
    ["POST", "/api/staging-verification/webhook-replay", "project_sync_mutation", 10, 60],
    ["POST", "/api/staging-verification/reconciliation", "project_sync_mutation", 10, 60],
    ["POST", "/api/projects/20000000-0000-4000-8000-000000000002/repository-removal", "destructive_mutation", 3, 3600],
    ["DELETE", "/api/account-deletion", "destructive_mutation", 3, 3600],
    ["POST", "/api/projects", "project_configuration_mutation", 30, 60],
    ["GET", "/api/github/installations/setup", "github_repository_mutation", 20, 60],
    ["GET", "/api/github/repositories", "github_expensive_read", 30, 60],
  ] as const)("maps %s %s to an atomic database scope", (method, pathname, scope, limit, windowSeconds) => {
    expect(rateLimitPolicyForRequest(method, pathname)).toEqual({ scope, limit, windowSeconds });
  });

  it("does not trust forwarded network headers and leaves non-target routes unmetered", () => {
    expect(rateLimitPolicyForRequest("POST", "/api/github/webhook")).toBeNull();
    expect(rateLimitPolicyForRequest("GET", "/project-galaxy")).toBeNull();
    expect(rateLimitPolicyForRequest("POST", "/api/staging-verification/webhook-replay/ticket")).toBeNull();
  });
});
