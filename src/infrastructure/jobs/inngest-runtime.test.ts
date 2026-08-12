import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Inngest } from "inngest";
import { StepMode, type IncomingOp } from "inngest/types";
import { createInngestSynchronizationFunctions, createInngestSynchronizationHandlers, inngestSynchronizationFunctionDefinitions, inngestSynchronizationRuntimeContract } from "./inngest-runtime";
const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const at = "2026-08-07T02:00:00.000Z";
const deliveryId = "33333333-3333-4333-8333-333333333333";
const job = (triggerSource: "first_sync" | "webhook" | "reconciliation" | "manual") => ({ version: "background-job.v1", jobType: "project.sync.requested.v1", jobId: runId, projectId, syncRunId: runId, idempotencyKey: `sync-request:${triggerSource}`, correlationId: `sync:${runId}`, requestedAt: at, triggerSource, webhookDelivery: triggerSource === "webhook" ? { deliveryId: "33333333-3333-4333-8333-333333333333", bodySha256: "a".repeat(64), eventName: "issues", action: "opened", installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic/repository", internalEventId: "github-webhook:33333333-3333-4333-8333-333333333333", processingVersion: 4 } : null });
function fixture() { const firstSync = { execute: vi.fn(async () => "first") }; const projectSync = { execute: vi.fn(async () => "project") }; const webhooks = { request: vi.fn(async () => "webhook-request"), execute: vi.fn(async () => "webhook-execute") }; const daily = { handle: vi.fn(async () => "daily") }; return { dependencies: { firstSync, projectSync, webhooks, daily }, firstSync, projectSync, webhooks, daily }; }
const webhookEvent = () => ({ version: "github-webhook-event.v1", eventId: `github-webhook:${deliveryId}`, idempotencyKey: `github-webhook:${deliveryId}`, deliveryId, bodySha256: "a".repeat(64), eventName: "push", kind: "github.push.v1", action: null, projectId, installationId: 151_329_457, repositoryId: 1_322_569_219, repositoryFullName: "synthetic/repository", githubObjectId: "3".repeat(40), receivedAt: at, processingVersion: 3 });
type SdkExecutionResult = { type: string; steps?: Array<{ id: string; op: string; data?: unknown }>; step?: { id: string; op: string; data?: unknown } };
type ExecutableInngestFunction = { createExecution(input: { partialOptions: Record<string, unknown> }): { start(): Promise<SdkExecutionResult> } };
const executeSdkFunction = async (client: Inngest, fn: unknown, stepState: Record<string, IncomingOp> = {}, stepCompletionOrder: string[] = [], requestedRunStep?: string) => {
  const event = { id: `event:${deliveryId}`, name: "executor/github.webhook.received.v1", data: webhookEvent(), ts: Date.parse(at) };
  const execution = (fn as ExecutableInngestFunction).createExecution({ partialOptions: { client, reqArgs: [], runId: "01J4SYNTHETICWEBHOOKRUN000", data: { event, events: [event], runId: "01J4SYNTHETICWEBHOOKRUN000", attempt: 0 }, stepState, stepCompletionOrder, stepMode: StepMode.AsyncCheckpointing, headers: {}, requestedRunStep } });
  return execution.start();
};
describe("inngest-synchronization-runtime.v1", () => {
  it("registers project, webhook and real daily cron production functions", () => { const f = fixture(); const functions = createInngestSynchronizationFunctions(new Inngest({ id: "synthetic-runtime", eventKey: "synthetic-event-key", signingKey: "signkey-test-synthetic" }), f.dependencies); expect(inngestSynchronizationRuntimeContract).toBe("inngest-synchronization-runtime.v1"); expect(functions).toHaveLength(3); expect(inngestSynchronizationFunctionDefinitions.map((item) => item.id)).toEqual(["executor-project-sync-consumer", "executor-github-webhook-consumer", "executor-daily-reconciliation"]); expect(inngestSynchronizationFunctionDefinitions[2]).toMatchObject({ trigger: "cron:0 2 * * *", idempotency: "domain:reconciliation:<UTC-day>" }); });
  it.each(["first_sync", "webhook", "reconciliation", "manual"] as const)("routes %s to trigger-correct real executor", async (trigger) => { const f = fixture(); const handlers = createInngestSynchronizationHandlers(f.dependencies); await handlers.projectSync(job(trigger)); expect(f.firstSync.execute).toHaveBeenCalledTimes(trigger === "first_sync" ? 1 : 0); expect(f.webhooks.execute).toHaveBeenCalledTimes(trigger === "webhook" ? 1 : 0); expect(f.projectSync.execute).toHaveBeenCalledTimes(["reconciliation", "manual"].includes(trigger) ? 1 : 0); });
  it("calls daily scheduler with canonical UTC and rejects invalid schedule", async () => { const f = fixture(); const handlers = createInngestSynchronizationHandlers(f.dependencies); await expect(handlers.daily(at)).resolves.toBe("daily"); expect(f.daily.handle).toHaveBeenCalledWith({ scheduledAt: at }); await expect(handlers.daily("not-a-time")).rejects.toThrow("reconciliation_schedule_invalid"); });
  it("strictly rejects an extra job field before any executor", async () => { const f = fixture(); const handlers = createInngestSynchronizationHandlers(f.dependencies); await expect(handlers.projectSync({ ...job("manual"), rawPayload: {} })).rejects.toThrow("background_job_invalid_request"); expect(f.projectSync.execute).not.toHaveBeenCalled(); });
  it.each([
    ["extra field", { ...webhookEvent(), rawPayload: {} }],
    ["inconsistent Push kind", { ...webhookEvent(), kind: "github.issue.v1" }],
    ["all-zero Push after SHA", { ...webhookEvent(), githubObjectId: "0".repeat(40) }],
  ])("rejects invalid %s before webhook synchronization claim", async (_case, input) => {
    const f = fixture();
    const handlers = createInngestSynchronizationHandlers(f.dependencies);
    await expect(handlers.webhook(input)).rejects.toThrow("github_webhook_event_invalid");
    expect(f.webhooks.request).not.toHaveBeenCalled();
  });
  it("uses a durable readiness boundary before requesting webhook synchronization and memoizes replay", async () => {
    const f = fixture();
    const client = new Inngest({ id: "synthetic-runtime", eventKey: "synthetic-event-key", signingKey: "signkey-test-synthetic", checkpointing: true });
    const functions = createInngestSynchronizationFunctions(client, f.dependencies);
    const webhook = functions[1];

    const discovery = await executeSdkFunction(client, webhook);
    expect(discovery).toMatchObject({ type: "steps-found", steps: [{ op: "Sleep" }] });
    expect(f.webhooks.request).not.toHaveBeenCalled();

    const sleep = discovery.steps?.[0];
    expect(sleep).toBeDefined();
    const requestDiscovery = await executeSdkFunction(client, webhook, { [sleep!.id]: { id: sleep!.id, data: null } }, [sleep!.id]);
    expect(requestDiscovery).toMatchObject({ type: "steps-found", steps: [{ op: "StepRun" }] });
    expect(f.webhooks.request).toHaveBeenCalledTimes(1);
    expect(f.webhooks.request).toHaveBeenCalledWith(webhookEvent());

    const request = requestDiscovery.steps?.[0];
    expect(request).toBeDefined();
    const replay = await executeSdkFunction(client, webhook, { [sleep!.id]: { id: sleep!.id, data: null }, [request!.id]: { id: request!.id, data: request!.data } }, [sleep!.id, request!.id]);
    expect(replay).toMatchObject({ type: "steps-found", steps: [{ op: "RunComplete", data: "webhook-request" }] });
    expect(f.webhooks.request).toHaveBeenCalledTimes(1);
  });
});
