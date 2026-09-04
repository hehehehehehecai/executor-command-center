export const githubWebhookSignatureContract = "github-webhook-signature.v1" as const;
export const githubWebhookDeliveryContract = "github-webhook-delivery.v1" as const;
export const githubWebhookEventContract = "github-webhook-event.v1" as const;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const eventNamePattern = /^[a-z][a-z0-9_]{0,63}$/;
const signaturePattern = /^sha256=[0-9a-f]{64}$/;
const actionPattern = /^[a-z][a-z0-9_]{0,63}$/;
const fullNamePattern = /^[^\s/]+\/[^\s/]+$/;
const commitShaPattern = /^(?!0{40}$)[0-9a-f]{40}$/;

const actions = {
  issues: ["opened", "edited", "closed", "reopened", "deleted"],
  pull_request: ["opened", "edited", "closed", "reopened", "synchronize", "converted_to_draft", "ready_for_review"],
  release: ["created", "edited", "deleted", "published", "unpublished", "prereleased", "released"],
  workflow_run: ["requested", "in_progress", "completed"],
  repository: ["edited", "renamed", "transferred", "publicized", "privatized", "archived", "unarchived", "deleted"],
  installation: ["deleted", "suspend", "unsuspend"],
} as const;

type RecordValue = Record<string, unknown>;
export type GitHubWebhookInstallationState = "active" | "suspended" | "revoked";
export type SupportedGitHubWebhookFact = {
  readonly supported: true;
  readonly kind: "github.push.v1" | "github.issue.v1" | "github.pull_request.v1" | "github.release.v1" | "github.workflow_run.v1" | "github.repository.v1" | "github.installation.v1";
  readonly action: string | null;
  readonly installationId: number;
  readonly repositoryId: number | null;
  readonly repositoryFullName: string | null;
  readonly githubObjectId: string;
  readonly installationState?: GitHubWebhookInstallationState;
};
export type IgnoredGitHubWebhookFact = {
  readonly supported: false;
  readonly action: string | null;
  readonly installationId: number | null;
  readonly repositoryId: number | null;
  readonly repositoryFullName: string | null;
};
export type ParsedGitHubWebhookFact = SupportedGitHubWebhookFact | IgnoredGitHubWebhookFact;

function record(value: unknown): value is RecordValue { return typeof value === "object" && value !== null && !Array.isArray(value); }
function positiveInteger(value: unknown): number | null { return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null; }
function childId(value: unknown): number | null { return record(value) ? positiveInteger(value.id) : null; }
function invalidPayload(): never { throw new Error("github_webhook_payload_invalid"); }

export function parseGitHubWebhookHeaders(input: { deliveryId: string; eventName: string; signature: string }) {
  if (!uuid.test(input.deliveryId) || !eventNamePattern.test(input.eventName) || !signaturePattern.test(input.signature)) throw new Error("github_webhook_headers_invalid");
  return { deliveryId: input.deliveryId, eventName: input.eventName, signature: input.signature };
}

function context(payload: RecordValue) {
  const installationId = childId(payload.installation);
  const repositoryId = childId(payload.repository);
  const fullName = record(payload.repository) && typeof payload.repository.full_name === "string" && fullNamePattern.test(payload.repository.full_name) ? payload.repository.full_name : null;
  return { installationId, repositoryId, repositoryFullName: fullName };
}

function ignored(payload: RecordValue): IgnoredGitHubWebhookFact {
  const value = context(payload);
  const action = typeof payload.action === "string" && actionPattern.test(payload.action) ? payload.action : null;
  return { supported: false, action, ...value };
}

export function parseGitHubWebhookEvent(eventName: string, value: unknown): ParsedGitHubWebhookFact {
  if (!record(value)) return invalidPayload();
  const payload = value;
  if (eventName === "installation") {
    const action = typeof payload.action === "string" ? payload.action : "";
    if (!(actions.installation as readonly string[]).includes(action)) return ignored(payload);
    const installationId = childId(payload.installation);
    if (!installationId) return invalidPayload();
    const states: Record<string, GitHubWebhookInstallationState> = { deleted: "revoked", suspend: "suspended", unsuspend: "active" };
    return { supported: true, kind: "github.installation.v1", action, installationId, repositoryId: null, repositoryFullName: null, githubObjectId: String(installationId), installationState: states[action]! };
  }
  if (eventName !== "push" && !(eventName in actions)) return ignored(payload);
  const action = eventName === "push" ? null : typeof payload.action === "string" ? payload.action : "";
  if (eventName !== "push" && !(actions[eventName as keyof typeof actions] as readonly string[]).includes(action ?? "")) return ignored(payload);
  const { installationId, repositoryId, repositoryFullName } = context(payload);
  if (!installationId || !repositoryId || !repositoryFullName) return invalidPayload();
  let kind: SupportedGitHubWebhookFact["kind"];
  let objectId: string | null = null;
  if (eventName === "push") { kind = "github.push.v1"; objectId = typeof payload.after === "string" && commitShaPattern.test(payload.after) ? payload.after : null; }
  else if (eventName === "issues") { kind = "github.issue.v1"; objectId = childId(payload.issue)?.toString() ?? null; }
  else if (eventName === "pull_request") { kind = "github.pull_request.v1"; objectId = childId(payload.pull_request)?.toString() ?? null; }
  else if (eventName === "release") { kind = "github.release.v1"; objectId = childId(payload.release)?.toString() ?? null; }
  else if (eventName === "workflow_run") { kind = "github.workflow_run.v1"; objectId = childId(payload.workflow_run)?.toString() ?? null; }
  else { kind = "github.repository.v1"; objectId = String(repositoryId); }
  if (!objectId) return invalidPayload();
  return { supported: true, kind, action, installationId, repositoryId, repositoryFullName, githubObjectId: objectId };
}
