import { describe, expect, it } from "vitest";
import { parseProjectCreation, parseProjectContextPatch, parseProjectContextId, contextCompleteness } from "./project-context";
import { parseProjectCalibrationInput, projectStatuses } from "./project-calibration";
const id = "11111111-1111-4111-8111-111111111111";

describe("未确认背景独立合同", () => {
  it("合法的大写 UUID 归一化后再绑定数据库返回行", () => {
    const canonical = "abcdef12-1234-4123-8abc-abcdef123456";
    expect(parseProjectCreation({ selectedRepositoryId: canonical.toUpperCase() })).toEqual({ selectedRepositoryId: canonical });
    expect(parseProjectContextId(canonical.toUpperCase())).toBe(canonical);
  });
  it("建项只需选择 ID，不伪造背景", () => {
    expect(parseProjectCreation({ selectedRepositoryId: id })).toEqual({ selectedRepositoryId: id });
  });
  it.each([{}, null, [], { selectedRepositoryId: "bad" }, { selectedRepositoryId: id, status: null }, { selectedRepositoryId: id, userId: id }, { selectedRepositoryId: id, ownerId: id }, { selectedRepositoryId: id, projectId: id }])("拒绝不合法建项输入 %#", value => {
    expect(() => parseProjectCreation(value)).toThrow("project_context_invalid_request");
  });
  it("保留字段存在性，省略不变而 null 明确清空", () => {
    expect(parseProjectContextPatch({ coreGoal: null })).toEqual({ coreGoal: null });
    expect(parseProjectContextPatch({ currentStageGoal: "阶段 🚀" })).toEqual({ currentStageGoal: "阶段 🚀" });
    expect(parseProjectContextPatch({ coreGoal: null })).not.toHaveProperty("status");
  });
  it.each([...projectStatuses, null])("接受正式状态或未确认 %s", status => {
    expect(parseProjectContextPatch({ status })).toEqual({ status });
  });
  it.each([{}, null, [], { coreGoal: undefined }, { coreGoal: "" }, { coreGoal: " " }, { coreGoal: " x" }, { currentStageGoal: "x\n" }, { currentBlocker: "\t" }, { coreGoal: "🚀".repeat(1001) }, { status: "unknown" }, { status: "" }, { coreGoal: 1 }, { userId: id }, { coreGoal: null, selectedRepositoryId: id }])("拒绝空更新、空白、长度或额外键 %#", value => {
    expect(() => parseProjectContextPatch(value)).toThrow("project_context_invalid_request");
  });
  it("UTF-16 边界且可清空已有 blocker", () => {
    expect(parseProjectContextPatch({ coreGoal: "🚀".repeat(1000), currentBlocker: null })).toEqual({ coreGoal: "🚀".repeat(1000), currentBlocker: null });
  });
  it("完整度不将项目存在或 blocker 当作背景确认", () => {
    expect(contextCompleteness({ coreGoal: null, currentStageGoal: null, status: null })).toEqual({ complete: false, missingFields: ["coreGoal", "currentStageGoal", "status"] });
    expect(contextCompleteness({ coreGoal: "目标", currentStageGoal: null, status: "dormant" })).toEqual({ complete: false, missingFields: ["currentStageGoal"] });
    expect(contextCompleteness({ coreGoal: "目标", currentStageGoal: "阶段", status: "completed" })).toEqual({ complete: true, missingFields: [] });
  });
  it("旧完整校准输入仍完整且拒绝新 null 语义", () => {
    const old = { selectedRepositoryId: id, coreGoal: "目标", currentStageGoal: "阶段", status: "in_planning" };
    expect(parseProjectCalibrationInput(old)).toEqual({ ...old, currentBlocker: null });
    expect(() => parseProjectCalibrationInput({ ...old, coreGoal: null })).toThrow("project_calibration_invalid_request");
  });
});
