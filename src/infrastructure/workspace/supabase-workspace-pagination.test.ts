import { describe, expect, it } from "vitest";
import { SupabaseWorkspaceContextReader } from "./supabase-workspace-context-reader";

const userId = "11111111-1111-4111-8111-111111111111";
function project(index: number, owner = userId) {
  return { id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`, user_id: owner, status: null, selected_repositories: { user_id: owner, full_name: `owner/repository-${index}`, github_installations: { user_id: owner, status: "active" } } };
}
function fixture(second: unknown[], secondError: unknown = null) {
  const calls: Array<[number, number]> = [];
  const first = Array.from({ length: 100 }, (_, index) => project(index));
  const client = { auth: {}, from() { return { select() {
    let offset = 0;
    const query = { eq: () => query, order: () => query,
      range(start: number, end: number) { offset = start; calls.push([start, end]); return query; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve({ data: offset === 0 ? first : second, error: offset === 0 ? null : secondError }).then(resolve, reject); } };
    return query;
  } }; } };
  return { calls, reader: new SupabaseWorkspaceContextReader(client as never) };
}
describe("T08 complete owned workspace project pagination", () => {
  it("reads every page rather than labeling the first page length as the project total", async () => {
    const value = fixture([project(100)]);
    const projects = await value.reader.readProjects(userId);
    expect(projects).toHaveLength(101);
    expect(projects[100]?.name).toBe("owner/repository-100");
    expect(value.calls).toEqual([[0, 99], [100, 199]]);
  });
  it("proves an exactly-full first page has no unseen next page", async () => {
    const value = fixture([]);
    expect(await value.reader.readProjects(userId)).toHaveLength(100);
    expect(value.calls).toEqual([[0, 99], [100, 199]]);
  });
  it("rejects a foreign owner on a later page rather than exposing a partial count", async () => {
    await expect(fixture([project(100, "99999999-9999-4999-8999-999999999999")]).reader.readProjects(userId)).rejects.toThrow("workspace_owner_mismatch");
  });
  it("keeps a later-page read failure a failure instead of returning an incomplete total", async () => {
    await expect(fixture([], new Error("provider private detail")).reader.readProjects(userId)).rejects.toThrow("workspace_read_failed");
  });
  it("fails closed if a provider repeats a page or duplicate ID", async () => {
    await expect(fixture([project(0)]).reader.readProjects(userId)).rejects.toThrow("workspace_read_failed");
  });
});
