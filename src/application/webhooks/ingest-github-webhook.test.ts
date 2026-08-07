import { describe, expect, it, vi } from "vitest";
import { IngestGitHubWebhook, parseWebhookInternalEvent, type GitHubWebhookDeliveryRepository, type GitHubWebhookDispatcher, type GitHubWebhookCryptography } from "./ingest-github-webhook";

const encoder = new TextEncoder();
const deliveryId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-06T04:00:00.000Z";
const signature = `sha256=${"a".repeat(64)}`;
function payload(action = "opened") { return encoder.encode(JSON.stringify({ action, installation: { id: 81_001 }, repository: { id: 91_001, full_name: "synthetic-owner/synthetic-repository" }, issue: { id: 101, body: "discard-me" }, projectId: "attacker-controlled" })); }

function fixture(overrides: { valid?: boolean; registration?: Awaited<ReturnType<GitHubWebhookDeliveryRepository["register"]>> } = {}) {
  const defaultRegistration: Awaited<ReturnType<GitHubWebhookDeliveryRepository["register"]>> = { outcome: "new", status: "pending", version: 1, projectId };
  const cryptography: GitHubWebhookCryptography = { verify: vi.fn(() => ({ valid: overrides.valid ?? true, bodySha256: "b".repeat(64) })) };
  const repository: GitHubWebhookDeliveryRepository = {
    register: vi.fn(async () => overrides.registration ?? defaultRegistration),
    claimDispatch: vi.fn(async () => ({ claimed: true, version: 2 })), completeDispatch: vi.fn(async () => undefined), completeInstallation: vi.fn(async () => undefined),
  };
  const dispatcher: GitHubWebhookDispatcher = { dispatch: vi.fn(async () => ({ providerReceiptId: "provider-event-001" })) };
  const parseJson = vi.fn((body: Uint8Array) => JSON.parse(new TextDecoder().decode(body)) as unknown);
  return { useCase: new IngestGitHubWebhook({ cryptography, repository, dispatcher, parseJson }), cryptography, repository, dispatcher, parseJson };
}
const request = (body = payload()) => ({ body, signature, deliveryId, eventName: "issues", receivedAt: now });

describe("github-webhook-ingestion.v1", () => {
  it("rejects invalid signature before JSON, database and dispatcher", async () => {
    const f = fixture({ valid: false });
    await expect(f.useCase.execute(request())).resolves.toEqual({ result: "rejected", code: "github_webhook_signature_invalid", httpStatus: 401 });
    expect(f.parseJson).not.toHaveBeenCalled(); expect(f.repository.register).not.toHaveBeenCalled(); expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("accepts a supported event with stable minimal lineage", async () => {
    const f = fixture();
    await expect(f.useCase.execute(request())).resolves.toEqual({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 });
    const event = { version: "github-webhook-event.v1", eventId: `github-webhook:${deliveryId}`, idempotencyKey: `github-webhook:${deliveryId}`, deliveryId, bodySha256: "b".repeat(64), eventName: "issues", kind: "github.issue.v1", action: "opened", projectId, installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic-owner/synthetic-repository", githubObjectId: "101", receivedAt: now, processingVersion: 2 } as const;
    expect(f.dispatcher.dispatch).toHaveBeenCalledWith(event);
    expect(parseWebhookInternalEvent(event)).toEqual(event);
    expect(() => parseWebhookInternalEvent({ ...event, rawPayload: {} })).toThrow("github_webhook_event_invalid");
    expect(() => parseWebhookInternalEvent({ ...event, version: "github-webhook-event.v2" })).toThrow("github_webhook_event_invalid");
    expect(JSON.stringify(vi.mocked(f.repository.register).mock.calls[0])).not.toMatch(/discard-me|attacker-controlled|raw|signature/i);
  });

  it("returns duplicate without dispatching completed delivery", async () => {
    const f = fixture({ registration: { outcome: "duplicate", status: "dispatched", version: 3, projectId } });
    await expect(f.useCase.execute(request())).resolves.toEqual({ result: "duplicate", code: "github_webhook_duplicate", httpStatus: 200 });
    expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("rejects a delivery identity conflict without dispatching", async () => {
    const f = fixture({ registration: { outcome: "conflict", status: "dispatched", version: 3, projectId } });
    await expect(f.useCase.execute(request())).resolves.toEqual({ result: "rejected", code: "github_webhook_delivery_conflict", httpStatus: 409 });
    expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("persists unsupported action as ignored and never dispatches", async () => {
    const f = fixture({ registration: { outcome: "new", status: "ignored", version: 1, projectId: null } });
    await expect(f.useCase.execute(request(payload("assigned")))).resolves.toEqual({ result: "ignored", code: "github_webhook_ignored", httpStatus: 200 });
    expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("recovers an expired dispatch with the same stable identity", async () => {
    const f = fixture({ registration: { outcome: "duplicate", status: "dispatching", version: 4, projectId } });
    await expect(f.useCase.execute(request())).resolves.toMatchObject({ result: "accepted", httpStatus: 202 });
    expect(f.repository.claimDispatch).toHaveBeenCalledWith({ deliveryId, expectedVersion: 4, claimedAt: now }); expect(f.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it("returns duplicate when another concurrent request owns the lease", async () => {
    const f = fixture({ registration: { outcome: "duplicate", status: "dispatching", version: 4, projectId } });
    vi.mocked(f.repository.claimDispatch).mockResolvedValue({ claimed: false, version: 4 });
    await expect(f.useCase.execute(request())).resolves.toMatchObject({ result: "duplicate", httpStatus: 200 }); expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("keeps persisted delivery recoverable when dispatch fails", async () => {
    const f = fixture(); vi.mocked(f.dispatcher.dispatch).mockRejectedValue(new Error("safe_transport_failure"));
    await expect(f.useCase.execute(request())).resolves.toEqual({ result: "rejected", code: "github_webhook_dispatch_unavailable", httpStatus: 503 }); expect(f.repository.completeDispatch).not.toHaveBeenCalled();
  });

  it.each([[1_048_576, 200], [1_048_577, 413]])("enforces body limit at %i bytes", async (size, httpStatus) => {
    const f = fixture(); const body = new Uint8Array(size);
    if (size === 1_048_576) { f.parseJson.mockReturnValue({ action: "assigned" }); vi.mocked(f.repository.register).mockResolvedValue({ outcome: "new", status: "ignored", version: 1, projectId: null }); }
    expect((await f.useCase.execute(request(body))).httpStatus).toBe(httpStatus); if (size > 1_048_576) expect(f.cryptography.verify).not.toHaveBeenCalled();
  });

  it("applies installation revocation without dispatching", async () => {
    const f = fixture(); const body = encoder.encode(JSON.stringify({ action: "deleted", installation: { id: 81_001 } }));
    await expect(f.useCase.execute({ ...request(body), eventName: "installation" })).resolves.toMatchObject({ result: "accepted" });
    expect(f.repository.completeInstallation).toHaveBeenCalledWith({ deliveryId, expectedVersion: 1, installationState: "revoked", completedAt: now }); expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
