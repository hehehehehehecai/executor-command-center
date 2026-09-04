import { describe, expect, it, vi } from "vitest";

import type { FirstSyncDispatchReceipt } from "./first-sync-use-cases";
import { StartAuthenticatedFirstRepositorySync } from "./first-sync-production-entry";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const receipt: FirstSyncDispatchReceipt = {
  syncRunId: "33333333-3333-4333-8333-333333333333",
  jobId: "33333333-3333-4333-8333-333333333333",
  correlationId: "first-sync:33333333-3333-4333-8333-333333333333",
  idempotencyKey: "first-sync:request-001",
  providerJobId: "provider-first-sync-001",
  windowStart: "2026-05-08T00:00:00.000Z",
  windowEnd: "2026-08-06T00:00:00.000Z",
  reused: false,
};

function setup(input: {
  authenticated?: boolean;
  owned?: boolean;
  contextStatus?: "active" | "suspended" | "revoked" | "missing";
} = {}) {
  const calls: string[] = [];
  const session = {
    getVerifiedUserId: vi.fn(async () => {
      calls.push("session");
      return input.authenticated === false ? null : userId;
    }),
  };
  const ownership = {
    isOwnedBy: vi.fn(async () => {
      calls.push("ownership");
      return input.owned !== false;
    }),
  };
  const start = {
    execute: vi.fn(async () => {
      calls.push("start");
      return receipt;
    }),
  };
  const contexts = {
    getByProjectId: vi.fn(async () => {
      calls.push("context");
      if (input.contextStatus === "missing") return null;
      return {
        projectId,
        repository: { fullName: "synthetic-owner/synthetic-repository" },
        installation: { status: input.contextStatus ?? "active" },
      };
    }),
  };
  const dependencies = { session, ownership, contexts, start };
  return {
    calls,
    session,
    ownership,
    contexts,
    start,
    entry: new StartAuthenticatedFirstRepositorySync(dependencies),
  };
}

describe("StartAuthenticatedFirstRepositorySync", () => {
  it("validates, verifies the session, proves ownership, then calls the real start boundary", async () => {
    const fixture = setup();

    await expect(fixture.entry.execute({ projectId, requestId: "request-001" }))
      .resolves.toEqual(receipt);

    expect(fixture.calls).toEqual(["session", "ownership", "context", "start"]);
    expect(fixture.ownership.isOwnedBy).toHaveBeenCalledWith({ projectId, userId });
    expect(fixture.start.execute).toHaveBeenCalledWith({ projectId, requestId: "request-001" });
  });

  it("rejects invalid input before session or ownership", async () => {
    const fixture = setup();
    await expect(fixture.entry.execute({ projectId: "bad", requestId: " request " }))
      .rejects.toThrow("first_sync_invalid_request");
    expect(fixture.calls).toEqual([]);
  });

  it("rejects an unauthenticated caller before ownership and start", async () => {
    const fixture = setup({ authenticated: false });
    await expect(fixture.entry.execute({ projectId, requestId: "request-001" }))
      .rejects.toThrow("first_sync_unauthenticated");
    expect(fixture.calls).toEqual(["session"]);
  });

  it("uses one non-enumerating result for foreign and missing projects", async () => {
    const fixture = setup({ owned: false });
    await expect(fixture.entry.execute({ projectId, requestId: "request-001" }))
      .rejects.toThrow("first_sync_project_not_found");
    expect(fixture.calls).toEqual(["session", "ownership"]);
    expect(fixture.start.execute).not.toHaveBeenCalled();
  });

  it.each(["missing", "suspended", "revoked"] as const)(
    "blocks %s repository context before creating a run or dispatching",
    async (contextStatus) => {
      const fixture = setup({ contextStatus });
      await expect(fixture.entry.execute({ projectId, requestId: "request-001" }))
        .rejects.toThrow(
          contextStatus === "missing"
            ? "first_sync_project_not_found"
            : "first_sync_authorization_revoked",
        );
      expect(fixture.calls).toEqual(["session", "ownership", "context"]);
      expect(fixture.start.execute).not.toHaveBeenCalled();
    },
  );

  it("preserves the existing start receipt and replay identity", async () => {
    const fixture = setup();
    fixture.start.execute
      .mockResolvedValueOnce(receipt)
      .mockResolvedValueOnce({ ...receipt, reused: true });
    const command = { projectId, requestId: "request-001" };
    const first = await fixture.entry.execute(command);
    const replay = await fixture.entry.execute(command);
    expect(replay).toEqual({ ...first, reused: true });
    expect(fixture.start.execute).toHaveBeenCalledTimes(2);
  });
});
