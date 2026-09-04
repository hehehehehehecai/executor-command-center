import { describe, expect, it, vi } from "vitest";

import { DailyReconciliationSchedulerAdapter } from "./reconciliation-scheduler";

describe("reconciliation-schedule.v1 adapter", () => {
  it("passes only the explicit scheduled timestamp to Application", async () => {
    const result = {
      window: {
        requestIdentity: "reconciliation:2026-08-06",
        windowStart: "2026-08-06T00:00:00.000Z",
        windowEnd: "2026-08-07T00:00:00.000Z",
        snapshotSince: "2026-05-09T00:00:00.000Z",
      },
      projects: [],
    };
    const execute = vi.fn(async () => result);
    const adapter = new DailyReconciliationSchedulerAdapter({ execute });
    await expect(adapter.handle({ scheduledAt: "2026-08-06T03:00:00.000Z" }))
      .resolves.toEqual(result);
    expect(execute).toHaveBeenCalledWith({ scheduledAt: "2026-08-06T03:00:00.000Z" });
  });
});
