import { describe, expect, it, vi } from "vitest";
import { handleDecisionRecordWrite } from "./decision-record-http";
import type { PersistedDecisionRecord } from "@/application/decision-records/decision-record-input";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const key = "33333333-3333-4333-8333-333333333333";
const origin = "http://127.0.0.1:3000";
const command = { idempotencyKey: key, decision: "  保留  手动决定 ", confirmationReason: "  用户 明确确认 ", alternatives: ["替代一", " ", "替代二"], references: [{ id: "reference-one", kind: "document", label: "依据", originalUrl: "https://example.invalid/evidence" }], revisitCondition: "  条件 改变时 " };
const saved: PersistedDecisionRecord = { id: key, userId, projectId, idempotencyKey: key, version: 1, decision: "保留 手动决定", confirmationReason: "用户 明确确认", alternatives: ["替代一", "替代二"], references: [], revisitCondition: "条件 改变时", status: "active", createdVia: "manual", confirmedBy: userId, confirmedAt: "2026-10-10T03:00:00.000Z", sourceCandidateId: null };
const request = (body: unknown = command, headers: Record<string, string> = {}, method = "POST") => new Request(`${origin}/api/projects/${projectId}/decisions`, { method, headers: { origin, "content-type": "application/json", ...headers }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
const foreignRequests: Record<string, string>[] = [{ origin: "https://foreign.invalid" }, { "sec-fetch-site": "cross-site" }];

describe("T09 explicit decision HTTP mutation", () => {
  it("saves normalized content and safe references with server result and private no-store headers", async () => {
    const execute = vi.fn().mockResolvedValue(saved);
    const response = await handleDecisionRecordWrite({ request: request(), projectId, flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(projectId, { ...command, decision: saved.decision, confirmationReason: saved.confirmationReason, alternatives: saved.alternatives, revisitCondition: saved.revisitCondition });
    expect(await response.json()).toEqual({ record: saved });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie, Origin");
  });
  it.each([undefined, "0", "true", true])("keeps saving disabled unless the flag is the string 1 (%s)", async flag => {
    const execute = vi.fn(); const response = await handleDecisionRecordWrite({ request: request(), projectId, flag, appOrigin: origin, execute });
    expect(response.status).toBe(404); expect(execute).not.toHaveBeenCalled();
  });
  it("keeps GET read-only even when saving is enabled", async () => {
    const execute = vi.fn(); const response = await handleDecisionRecordWrite({ request: request(command, {}, "GET"), projectId, flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("POST"); expect(execute).not.toHaveBeenCalled();
  });
  it.each(foreignRequests)("rejects an untrusted origin/site before storage (%j)", async headers => {
    const execute = vi.fn(); const response = await handleDecisionRecordWrite({ request: request(command, headers), projectId, flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(403); expect(execute).not.toHaveBeenCalled();
  });
  it.each([{ confirmedBy: userId }, { confirmedAt: saved.confirmedAt }, { userId }, { projectId }, { version: 9 }])("rejects client-owned server metadata (%j)", async extra => {
    const execute = vi.fn(); const response = await handleDecisionRecordWrite({ request: request({ ...command, ...extra }), projectId, flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(400); expect(execute).not.toHaveBeenCalled();
  });
  it("rejects an empty decision and retains non-linked evidence for unsafe URLs", async () => {
    const execute = vi.fn().mockResolvedValue(saved);
    const invalid = await handleDecisionRecordWrite({ request: request({ ...command, decision: " \n " }), projectId, flag: "1", appOrigin: origin, execute });
    expect(invalid.status).toBe(400); expect(execute).not.toHaveBeenCalled();
    await handleDecisionRecordWrite({ request: request({ ...command, references: [{ ...command.references[0], originalUrl: "https://name:secret@example.invalid/private" }] }), projectId, flag: "1", appOrigin: origin, execute });
    expect(execute.mock.calls[0][1].references[0]).toEqual({ ...command.references[0], originalUrl: null });
  });
  it.each([["decision_record_unauthenticated", 401], ["decision_record_forbidden", 403], ["decision_record_conflict", 409], ["unknown_database_error", 503]])("preserves meaningful safe failure status (%s)", async (code, status) => {
    const execute = vi.fn().mockRejectedValue(new Error(String(code)));
    const response = await handleDecisionRecordWrite({ request: request(), projectId, flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).not.toHaveProperty("stack");
  });
});
