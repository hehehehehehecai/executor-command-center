import { describe, expect, it, vi } from "vitest";

import { SupabaseFirstSyncProjectOwnershipReader } from "./supabase-first-sync-project-ownership-reader";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function client(result: { data: { id?: unknown } | null; error: unknown }) {
  const maybeSingle = vi.fn(async () => result);
  const userEq = vi.fn(() => ({ maybeSingle }));
  const projectEq = vi.fn(() => ({ eq: userEq }));
  const select = vi.fn(() => ({ eq: projectEq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, from, select, projectEq, userEq, maybeSingle };
}

describe("SupabaseFirstSyncProjectOwnershipReader", () => {
  it("uses only the session-scoped projects RLS query and returns a boolean", async () => {
    const fake = client({ data: { id: projectId }, error: null });
    const reader = new SupabaseFirstSyncProjectOwnershipReader(fake.client);
    await expect(reader.isOwnedBy({ projectId, userId })).resolves.toBe(true);
    expect(fake.from).toHaveBeenCalledWith("projects");
    expect(fake.select).toHaveBeenCalledWith("id");
    expect(fake.projectEq).toHaveBeenCalledWith("id", projectId);
    expect(fake.userEq).toHaveBeenCalledWith("user_id", userId);
  });

  it("does not enumerate a missing or foreign project", async () => {
    const fake = client({ data: null, error: null });
    const reader = new SupabaseFirstSyncProjectOwnershipReader(fake.client);
    await expect(reader.isOwnedBy({ projectId, userId })).resolves.toBe(false);
  });

  it("normalizes provider failures", async () => {
    const fake = client({ data: null, error: { message: "private SQL detail" } });
    const reader = new SupabaseFirstSyncProjectOwnershipReader(fake.client);
    await expect(reader.isOwnedBy({ projectId, userId }))
      .rejects.toThrow("first_sync_ownership_read_failed");
  });
});
