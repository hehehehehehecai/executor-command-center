import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualDecisionSaveForm } from "./ManualDecisionSaveForm";
import { DecisionArchivePanel } from "./DecisionArchivePanel";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const projectId = "11111111-1111-4111-8111-111111111111";
function fill() {
  fireEvent.change(screen.getByRole("textbox", { name: "决定内容" }), { target: { value: "保留本人手动决策" } });
  fireEvent.change(screen.getByRole("textbox", { name: "确认原因" }), { target: { value: "用户明确填写" } });
}
describe("T09 explicit Connected save form", () => {
  it("posts authored content to the current project and refreshes only after confirmed success", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ record: { id: "server-record" } })); vi.stubGlobal("fetch", transport);
    render(<ManualDecisionSaveForm projectId={projectId} />); fill();
    fireEvent.change(screen.getByRole("textbox", { name: "引用链接（可选，HTTPS）" }), { target: { value: "https://example.invalid/evidence" } });
    fireEvent.submit(screen.getByRole("form", { name: "手动创建决策记录" }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
    const [path, init] = transport.mock.calls[0]; const body = JSON.parse(init.body);
    expect(path).toBe(`/api/projects/${projectId}/decisions`); expect(init.method).toBe("POST");
    expect(body).toMatchObject({ decision: "保留本人手动决策", confirmationReason: "用户明确填写", references: [{ kind: "document", originalUrl: "https://example.invalid/evidence" }] });
    expect(body).not.toHaveProperty("confirmedBy"); expect(body).not.toHaveProperty("confirmedAt");
    expect(screen.getByRole("status")).toHaveTextContent("决策已保存");
  });
  it("keeps the same submission key after a lost response and retains entered content", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("response_lost")); vi.stubGlobal("fetch", transport);
    render(<ManualDecisionSaveForm projectId={projectId} />); fill();
    const form = screen.getByRole("form", { name: "手动创建决策记录" });
    fireEvent.submit(form); await screen.findByText(/未收到保存结果/);
    expect(screen.getByRole("textbox", { name: "决定内容" })).toHaveValue("保留本人手动决策");
    fireEvent.submit(form); await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(JSON.parse(transport.mock.calls[0][1].body).idempotencyKey).toBe(JSON.parse(transport.mock.calls[1][1].body).idempotencyKey);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
  it("renders a read-only Connected state without a mutation or local-preview form", () => {
    render(<DecisionArchivePanel projectId={projectId} readOnly viewModel={{ mode: "connected", provenanceLabel: "当前本人项目", candidates: [], records: [], readState: { kind: "empty", label: "读取成功", description: "无决策", scopeLabel: "本人项目", nextStep: "刷新" } }} />);
    expect(screen.queryByRole("form", { name: "手动创建决策记录" })).not.toBeInTheDocument();
    expect(screen.getByText(/已有记录仍按本人项目权限读取/)).toBeVisible();
  });
});
