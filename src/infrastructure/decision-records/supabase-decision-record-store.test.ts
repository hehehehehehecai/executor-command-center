import { describe, expect, it, vi } from "vitest";
import { SupabaseDecisionRecordStore, type DecisionRecordSessionClient } from "./supabase-decision-record-store";

const userId = "11111111-1111-4111-8111-111111111111", projectId = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333";
const row = { id, user_id: userId, project_id: projectId, idempotency_key: id, version: 1, decision: "决定", confirmation_reason: "原因", alternatives: ["替代"], references: [{ id: "reference", kind: "issue", label: "证据", originalUrl: "https://example.invalid/issue" }], status: "active", revisit_condition: "变化时", created_via: "manual", confirmed_by: userId, confirmed_at: "2026-10-10T03:00:00Z", source_candidate_id: null };
function client(result: { data: unknown; error: unknown }) {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query); query.limit.mockResolvedValue(result);
  const value = { from: vi.fn(() => query), rpc: vi.fn().mockResolvedValue(result) };
  return { ...value, query, store: new SupabaseDecisionRecordStore(value as unknown as DecisionRecordSessionClient) };
}
describe("T09 session-bound decision storage", () => {
  it("reads every persisted field under the user and project filters without writes", async () => {
    const value = client({ data: [row], error: null });
    const result = await value.store.read({ userId, projectId });
    expect(result).toMatchObject({ kind: "ready", userId, projectId, records: [{ record: { id, userId, projectId, idempotencyKey: id, version: 1, decision: row.decision, confirmationReason: row.confirmation_reason, alternatives: row.alternatives, references: row.references, confirmedBy: userId, confirmedAt: row.confirmed_at, createdVia: "manual", sourceCandidateId: null } }] });
    expect(value.query.eq.mock.calls).toEqual([["user_id", userId], ["project_id", projectId]]);
    expect(value.rpc).not.toHaveBeenCalled();
  });
  it("distinguishes compatible missing storage, successful empty and a real query failure", async () => {
    expect(await client({ data: null, error: { code: "PGRST205" } }).store.read({ userId, projectId })).toMatchObject({ kind: "not_enabled" });
    expect(await client({ data: [], error: null }).store.read({ userId, projectId })).toMatchObject({ kind: "ready", records: [] });
    await expect(client({ data: null, error: { code: "08006" } }).store.read({ userId, projectId })).rejects.toThrow("decision_record_unavailable");
  });
  it("never trusts a foreign owner or a forged confirmation actor returned by storage", async () => {
    await expect(client({ data: [{ ...row, user_id: projectId }], error: null }).store.read({ userId, projectId })).rejects.toThrow("decision_record_unavailable");
    await expect(client({ data: [{ ...row, confirmed_by: projectId }], error: null }).store.read({ userId, projectId })).rejects.toThrow("decision_record_unavailable");
  });
  it("delegates the server-verified actor and editable content to the invoker RPC", async () => {
    const value = client({ data: row, error: null });
    const command = { idempotencyKey: id, decision: row.decision, confirmationReason: row.confirmation_reason, alternatives: row.alternatives, references: row.references as [{ id: string; kind: "issue"; label: string; originalUrl: string }], revisitCondition: row.revisit_condition };
    expect(await value.store.create({ userId, projectId, command })).toMatchObject({ confirmedBy: userId, confirmedAt: row.confirmed_at, idempotencyKey: id, version: 1 });
    expect(value.rpc).toHaveBeenCalledWith("create_manual_decision_record", { p_actor_user_id: userId, p_project_id: projectId, p_idempotency_key: id, p_decision: row.decision, p_confirmation_reason: row.confirmation_reason, p_alternatives: row.alternatives, p_references: row.references, p_revisit_condition: row.revisit_condition });
    expect(value.from).not.toHaveBeenCalled();
  });
});
