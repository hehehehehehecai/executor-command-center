import { describe, expect, it } from "vitest";
import { loadCommandDeckOverview, type CommandDeckConnectedPort } from "./command-deck-connected-query";

const owner = { userId: "account-A", projectId: "project-A" };
const overview = { kind: "ready" as const, ...owner, cards: {}, readState: { kind: "empty" as const, label: "已读取", description: "成功空", scopeLabel: "当前项目", nextStep: "刷新" } };
describe("home read-only aggregation query", () => {
  it("reuses one load for the complete card overview", async () => {
    let loads = 0;
    const port = { async load() { loads++; return overview; } };
    expect(await loadCommandDeckOverview(port, owner)).toEqual(overview);
    expect(loads).toBe(1);
  });
  it.each(["owner", "project"])("rejects stale %s before exposing statistics", async field => {
    const port: CommandDeckConnectedPort = { async load() { return { ...overview, ...(field === "owner" ? { userId: "account-B" } : { projectId: "project-B" }) }; } };
    expect(await loadCommandDeckOverview(port, owner)).toEqual({ kind: "failed" });
  });
  it("keeps read failure distinct from success with zero metrics", async () => {
    expect(await loadCommandDeckOverview({ async load() { throw new Error("storage unavailable"); } }, owner)).toEqual({ kind: "failed" });
  });
});
