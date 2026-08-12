import "server-only";
import { cron, type Inngest } from "inngest";
import { parseBackgroundJob } from "@/domain/jobs/background-job";
import { parseWebhookInternalEvent } from "@/application/webhooks/ingest-github-webhook";

export const inngestSynchronizationRuntimeContract = "inngest-synchronization-runtime.v1" as const;
const pushCommitShaPattern = /^(?!0{40}$)[0-9a-f]{40}$/;
const webhookKindByEventName = {
  push: "github.push.v1",
  issues: "github.issue.v1",
  pull_request: "github.pull_request.v1",
  release: "github.release.v1",
  workflow_run: "github.workflow_run.v1",
  repository: "github.repository.v1",
} as const;
export const inngestSynchronizationFunctionDefinitions = [
  { id: "executor-project-sync-consumer", trigger: "executor/project.sync.requested.v1", idempotency: "event.data.jobId", concurrency: "event.data.projectId" },
  { id: "executor-github-webhook-consumer", trigger: "executor/github.webhook.received.v1", idempotency: "event.data.eventId", concurrency: "event.data.deliveryId" },
  { id: "executor-daily-reconciliation", trigger: "cron:0 2 * * *", idempotency: "domain:reconciliation:<UTC-day>", concurrency: "daily-reconciliation" },
] as const;

export type InngestSynchronizationRuntimeDependencies = {
  readonly firstSync: { execute(input: { job: unknown; signal?: AbortSignal }): Promise<unknown> };
  readonly projectSync: { execute(input: { job: unknown; signal?: AbortSignal }): Promise<unknown> };
  readonly webhooks: { request(input: unknown): Promise<unknown>; execute(input: { job: unknown; signal?: AbortSignal }): Promise<unknown> };
  readonly daily: { handle(input: { scheduledAt: string; signal?: AbortSignal }): Promise<unknown> | unknown };
};

export function createInngestSynchronizationHandlers(dependencies: InngestSynchronizationRuntimeDependencies) {
  return {
    projectSync: async (data: unknown) => {
      const job = parseBackgroundJob(data);
      if ((job.triggerSource ?? "first_sync") === "first_sync") return dependencies.firstSync.execute({ job });
      if (job.triggerSource === "webhook") return dependencies.webhooks.execute({ job });
      return dependencies.projectSync.execute({ job });
    },
    webhook: async (data: unknown) => {
      const event = parseWebhookInternalEvent(data);
      const expectedKind = event.eventName ? webhookKindByEventName[event.eventName as keyof typeof webhookKindByEventName] : undefined;
      if (!expectedKind || event.kind !== expectedKind || (expectedKind === "github.push.v1" && (event.action !== null || !pushCommitShaPattern.test(event.githubObjectId)))) {
        throw new Error("github_webhook_event_invalid");
      }
      return dependencies.webhooks.request(event);
    },
    daily: async (scheduledAt: unknown) => {
      if (typeof scheduledAt !== "string") throw new Error("reconciliation_schedule_invalid");
      const parsed = Date.parse(scheduledAt);
      if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== scheduledAt) throw new Error("reconciliation_schedule_invalid");
      return dependencies.daily.handle({ scheduledAt });
    },
  };
}

export function createInngestSynchronizationFunctions(client: Inngest, dependencies: InngestSynchronizationRuntimeDependencies) {
  const handlers = createInngestSynchronizationHandlers(dependencies);
  const projectSync = client.createFunction(
    { id: "executor-project-sync-consumer", triggers: { event: "executor/project.sync.requested.v1" }, retries: 5, concurrency: { limit: 1, key: "event.data.projectId" }, idempotency: "event.data.jobId" },
    async ({ event, step }) => step.run("execute-project-sync", () => handlers.projectSync(event.data)),
  );
  const webhook = client.createFunction(
    { id: "executor-github-webhook-consumer", triggers: { event: "executor/github.webhook.received.v1" }, retries: 5, concurrency: { limit: 1, key: "event.data.deliveryId" }, idempotency: "event.data.eventId" },
    async ({ event, step }) => {
      await step.sleep("await-webhook-dispatch", "1s");
      return step.run("request-webhook-sync", () => handlers.webhook(event.data));
    },
  );
  const daily = client.createFunction(
    { id: "executor-daily-reconciliation", triggers: cron("0 2 * * *"), retries: 5, concurrency: 1 },
    async ({ event, step }) => step.run("run-daily-reconciliation", () => handlers.daily(new Date(event.ts).toISOString())),
  );
  return [projectSync, webhook, daily] as const;
}
