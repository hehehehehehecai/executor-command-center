import { describe, expect, it } from "vitest";
import { githubWebhookEventContract, parseGitHubWebhookEvent, parseGitHubWebhookHeaders } from "./github-webhook";

const installation = { id: 81_001 };
const repository = { id: 91_001, full_name: "synthetic-owner/synthetic-repository" };

describe("github-webhook-event.v1", () => {
  it("validates canonical delivery, event and signature headers", () => {
    expect(githubWebhookEventContract).toBe("github-webhook-event.v1");
    expect(parseGitHubWebhookHeaders({ deliveryId: "11111111-1111-4111-8111-111111111111", eventName: "pull_request", signature: `sha256=${"a".repeat(64)}` })).toEqual({ deliveryId: "11111111-1111-4111-8111-111111111111", eventName: "pull_request", signature: `sha256=${"a".repeat(64)}` });
  });

  it.each([
    ["push", { installation, repository, after: "a".repeat(40) }, "github.push.v1", "a".repeat(40)],
    ["issues", { action: "edited", installation, repository, issue: { id: 101 } }, "github.issue.v1", "101"],
    ["pull_request", { action: "synchronize", installation, repository, pull_request: { id: 102 } }, "github.pull_request.v1", "102"],
    ["release", { action: "published", installation, repository, release: { id: 103 } }, "github.release.v1", "103"],
    ["workflow_run", { action: "completed", installation, repository, workflow_run: { id: 104 } }, "github.workflow_run.v1", "104"],
    ["repository", { action: "archived", installation, repository }, "github.repository.v1", "91001"],
  ])("maps supported %s payload to a minimal internal fact", (eventName, payload, kind, objectId) => {
    expect(parseGitHubWebhookEvent(eventName, payload)).toMatchObject({ supported: true, kind, installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic-owner/synthetic-repository", githubObjectId: objectId });
  });

  it.each([["deleted", "revoked"], ["suspend", "suspended"], ["unsuspend", "active"]])("maps installation %s without inventing a repository", (action, installationState) => {
    expect(parseGitHubWebhookEvent("installation", { action, installation })).toEqual({ supported: true, kind: "github.installation.v1", action, installationId: 81_001, repositoryId: null, repositoryFullName: null, githubObjectId: "81001", installationState });
  });

  it("marks unknown action ignored without retaining unknown payload fields", () => {
    expect(parseGitHubWebhookEvent("issues", { action: "assigned", installation, repository, issue: { id: 101, body: "must-not-survive" }, projectId: "attacker-controlled" })).toEqual({ supported: false, action: "assigned", installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic-owner/synthetic-repository" });
  });

  it("rejects missing minimum fields for a supported action", () => {
    expect(() => parseGitHubWebhookEvent("issues", { action: "opened", installation, repository })).toThrow("github_webhook_payload_invalid");
  });

  it.each([
    ["uppercase SHA", "A".repeat(40)],
    ["short SHA", "a".repeat(39)],
    ["all-zero deletion SHA", "0".repeat(40)],
  ])("rejects a Push with %s instead of silently reading the default branch", (_label, after) => {
    expect(() => parseGitHubWebhookEvent("push", { installation, repository, after }))
      .toThrow("github_webhook_payload_invalid");
  });

  it.each([
    [{ deliveryId: "", eventName: "push", signature: `sha256=${"a".repeat(64)}` }],
    [{ deliveryId: "not-a-uuid", eventName: "push", signature: `sha256=${"a".repeat(64)}` }],
    [{ deliveryId: "11111111-1111-4111-8111-111111111111", eventName: "Push", signature: `sha256=${"a".repeat(64)}` }],
    [{ deliveryId: "11111111-1111-4111-8111-111111111111", eventName: "push", signature: `sha1=${"a".repeat(40)}` }],
    [{ deliveryId: "11111111-1111-4111-8111-111111111111", eventName: "push", signature: `sha256=${"A".repeat(64)}` }],
  ])("rejects non-canonical headers", (headers) => expect(() => parseGitHubWebhookHeaders(headers)).toThrow("github_webhook_headers_invalid"));
});
