// @vitest-environment node

import { beforeAll, describe, expect, it } from "vitest";

type BackgroundJobModule = {
  backgroundJobContract: string;
  backgroundJobTypes: readonly string[];
  parseBackgroundJob(value: unknown): Record<string, unknown>;
};

let jobs: Partial<BackgroundJobModule> = {};

beforeAll(async () => {
  const modulePath = "./background-job";
  jobs = await import(modulePath).catch(() => ({}));
});
const validJob = {
  version: "background-job.v1",
  jobType: "project.sync.requested.v1",
  jobId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  syncRunId: "33333333-3333-4333-8333-333333333333",
  idempotencyKey: "sync-request:fixture-001",
  correlationId: "correlation:fixture-001",
  requestedAt: "2026-08-05T12:00:00.000Z",
} as const;

const currentJob = {
  ...validJob,
  triggerSource: "manual",
  webhookDelivery: null,
} as const;

const webhookJob = {
  ...validJob,
  triggerSource: "webhook",
  webhookDelivery: {
    deliveryId: "44444444-4444-4444-8444-444444444444",
    bodySha256: "a".repeat(64),
    eventName: "issues",
    action: "opened",
    installationId: 81_001,
    repositoryId: 91_001,
    repositoryFullName: "synthetic-owner/synthetic-repository",
    internalEventId: "github-webhook:44444444-4444-4444-8444-444444444444",
    processingVersion: 4,
  },
} as const;

describe("background-job.v1", () => {
  it("parses the exact supported job into a JSON-serializable value", () => {
    expect(jobs.backgroundJobContract).toBe("background-job.v1");
    expect(jobs.backgroundJobTypes).toEqual(["project.sync.requested.v1"]);
    const parsed = jobs.parseBackgroundJob?.(validJob);
    expect(parsed).toEqual(validJob);
    expect(JSON.parse(JSON.stringify(jobs.parseBackgroundJob?.(currentJob)))).toEqual(currentJob);
  });

  it("strictly parses trusted Webhook delivery lineage", () => {
    expect(jobs.parseBackgroundJob?.(webhookJob)).toEqual(webhookJob);
  });

  it.each([
    ["missing lineage", { ...webhookJob, webhookDelivery: null }],
    ["lineage on manual", { ...webhookJob, triggerSource: "manual" }],
    ["unsafe digest", { ...webhookJob, webhookDelivery: { ...webhookJob.webhookDelivery, bodySha256: "bad" } }],
    ["unsafe version", { ...webhookJob, webhookDelivery: { ...webhookJob.webhookDelivery, processingVersion: 0 } }],
    ["extra lineage field", { ...webhookJob, webhookDelivery: { ...webhookJob.webhookDelivery, rawPayload: "forbidden" } }],
  ])("rejects %s", (_label, value) => {
    expect(() => jobs.parseBackgroundJob?.(value)).toThrow("background_job_invalid_request");
  });

  it("rejects an unknown version", () => {
    expect(() => jobs.parseBackgroundJob?.({ ...validJob, version: "background-job.v2" }))
      .toThrow("background_job_invalid_request");
  });

  it("rejects an unknown job type with a stable error", () => {
    expect(() => jobs.parseBackgroundJob?.({ ...validJob, jobType: "webhook.dispatch.v1" }))
      .toThrow("background_job_unsupported_type");
  });

  it.each(["jobId", "projectId", "syncRunId"] as const)(
    "rejects invalid %s",
    (field) => {
      expect(() => jobs.parseBackgroundJob?.({ ...validJob, [field]: "not-a-uuid" }))
        .toThrow("background_job_invalid_request");
    },
  );

  it.each([
    ["idempotencyKey", " duplicate "],
    ["idempotencyKey", "contains space"],
    ["correlationId", ""],
    ["correlationId", "contains/slash"],
  ] as const)("rejects unsafe %s", (field, value) => {
    expect(() => jobs.parseBackgroundJob?.({ ...validJob, [field]: value }))
      .toThrow("background_job_invalid_request");
  });

  it("rejects a non-canonical requestedAt timestamp", () => {
    expect(() => jobs.parseBackgroundJob?.({
      ...validJob,
      requestedAt: "2026-08-05 12:00:00",
    })).toThrow("background_job_invalid_request");
  });

  it.each([
    "token",
    "secret",
    "authorization",
    "authorizationHeader",
    "cookie",
    "serviceRoleKey",
    "rawPayload",
    "rawResponse",
    "githubPayload",
    "sourceCode",
    "diff",
  ])("rejects forbidden or extra field %s", (field) => {
    expect(() => jobs.parseBackgroundJob?.({ ...validJob, [field]: "synthetic-sensitive" }))
      .toThrow("background_job_invalid_request");
  });
});
