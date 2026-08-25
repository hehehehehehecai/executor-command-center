// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), request: vi.fn(), status: vi.fn(), cancel: vi.fn(),
}));
vi.mock("./account-deletion-route-dependencies", () => ({ createAccountDeletionUseCases: mocks.create }));
import { DELETE, GET, POST, dynamic } from "./route";

const account = {
  operationId: "b3800000-0000-4000-8000-000000000001",
  status: "deletion_pending", outcome: "executed",
  requestedAt: "2026-08-25T06:00:00.000Z", dueAt: "2026-09-01T06:00:00.000Z", safelyRetryable: true,
};

describe("/api/account-deletion", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    mocks.create.mockResolvedValue({
      request: { execute: mocks.request }, status: { execute: mocks.status }, cancel: { execute: mocks.cancel },
    });
    mocks.request.mockResolvedValue(account); mocks.status.mockResolvedValue({ status: "active" }); mocks.cancel.mockResolvedValue({ ...account, status: "active" });
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("serves status, request, and cancellation through application use cases", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect((await GET()).status).toBe(200);
    const post = await POST(new Request("https://executor.example.test/api/account-deletion", {
      method: "POST", headers: { origin: "https://executor.example.test", "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "phase3:route", confirmation: "DELETE ACCOUNT b3000000-0000-4000-8000-000000000001" }),
    }));
    expect(post.status).toBe(202);
    await expect(post.json()).resolves.toEqual({ account });
    const remove = await DELETE(new Request("https://executor.example.test/api/account-deletion", {
      method: "DELETE", headers: { origin: "https://executor.example.test", "content-type": "application/json" },
      body: JSON.stringify({ operationId: account.operationId }),
    }));
    expect(remove.status).toBe(200);
    expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.cancel).toHaveBeenCalledOnce(); expect(mocks.status).toHaveBeenCalledOnce();
  });

  it("rejects cross-origin mutation before constructing privileged dependencies", async () => {
    const response = await POST(new Request("https://executor.example.test/api/account-deletion", {
      method: "POST", headers: { origin: "https://attacker.example.test", "content-type": "application/json" }, body: "{}",
    }));
    expect(response.status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects mutation without an Origin header before constructing privileged dependencies", async () => {
    const response = await DELETE(new Request("https://executor.example.test/api/account-deletion", {
      method: "DELETE", headers: { "content-type": "application/json" }, body: "{}",
    }));
    expect(response.status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps forbidden/not-found non-enumerating and maps retryable infrastructure failure", async () => {
    mocks.request.mockRejectedValueOnce(new Error("account_deletion_not_found"));
    const hidden = await POST(new Request("https://executor.example.test/api/account-deletion", {
      method: "POST", headers: { origin: "https://executor.example.test", "content-type": "application/json" }, body: "{}",
    }));
    expect(hidden.status).toBe(404);
    mocks.status.mockRejectedValueOnce(new Error("provider raw secret"));
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toMatch(/provider|secret|stack/i);
  });
});
