import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBriefGenerationAction } from "./ProjectLifecycleActions";

const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function clickGenerate() {
  const button = await screen.findByRole("button", { name: "生成项目简报" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("T11 持久生成意图", () => {
  it("响应丢失后重新挂载恢复原范围和key，不随默认时钟变化建立新请求", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("response lost"));
    vi.stubGlobal("fetch", fetcher);
    const first = render(<ProjectBriefGenerationAction projectId={projectId} />);
    await clickGenerate();
    await screen.findByRole("alert");
    const original = JSON.parse(fetcher.mock.calls[0][1].body);
    first.unmount();
    render(<ProjectBriefGenerationAction projectId={projectId} />);
    await screen.findByText(/已恢复本次生成请求/);
    await clickGenerate();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(original);
  });

  it("用户实际改变范围才使用新key，同一新范围继续复用", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("response lost"));
    vi.stubGlobal("fetch", fetcher);
    render(<ProjectBriefGenerationAction projectId={projectId} />);
    await clickGenerate(); await screen.findByRole("alert");
    const original = JSON.parse(fetcher.mock.calls[0][1].body);
    fireEvent.change(screen.getByLabelText("开始时间（UTC）"), { target: { value: "2026-09-01T00:00" } });
    await clickGenerate(); await screen.findByRole("alert");
    const changed = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(changed.requestKey).not.toBe(original.requestKey);
    expect(changed.rangeStart).toBe("2026-09-01T00:00:00.000Z");
    await clickGenerate(); await screen.findByRole("alert");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(changed);
  });

  it("实际切换项目建立对应意图，不带入另一项目key", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("response lost"));
    vi.stubGlobal("fetch", fetcher);
    const first = render(<ProjectBriefGenerationAction projectId={projectId} />);
    await clickGenerate(); await screen.findByRole("alert"); first.unmount();
    render(<ProjectBriefGenerationAction projectId={otherProjectId} />);
    await clickGenerate(); await screen.findByRole("alert");
    expect(fetcher.mock.calls[1][0]).toContain(otherProjectId);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).requestKey).not.toBe(JSON.parse(fetcher.mock.calls[0][1].body).requestKey);
  });

  it("恢复范围已有服务端验证的正文时不再POST", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const intent = { projectId, rangeStart: "2026-10-01T00:00:00.000Z", rangeEnd: "2026-10-02T00:00:00.000Z", requestKey: "ui-brief:recover-original" };
    sessionStorage.setItem(`project-brief-intent:${projectId}`, JSON.stringify(intent));
    render(<ProjectBriefGenerationAction projectId={projectId} verifiedRange={intent} />);
    await clickGenerate(); await screen.findByText(/本次范围已有已验证简报/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("不能持久保存key时不发送计费请求", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage denied"); });
    render(<ProjectBriefGenerationAction projectId={projectId} />);
    await clickGenerate(); await screen.findByRole("alert");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("实际配额不足显示原服务端错误并保留原请求", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "project_brief_quota_reservation_failed" } }, { status: 402 }));
    vi.stubGlobal("fetch", fetcher);
    render(<ProjectBriefGenerationAction projectId={projectId} availableEnergy={1} />);
    expect(screen.getByText(/当前可用能量：1/)).toBeVisible();
    await clickGenerate(); expect(await screen.findByRole("alert")).toHaveTextContent("能量点不足或预占失败");
    expect(sessionStorage.getItem(`project-brief-intent:${projectId}`)).toContain(JSON.parse(fetcher.mock.calls[0][1].body).requestKey);
  });

  it.each([
    ["provider", "project_brief_provider_failure", 502],
    ["schema", "project_brief_schema_validation_failed", 422],
  ])("已确认%s失败退款后用户重试建立新尝试；新尝试丢响应仍复用新key", async (_kind, code, status) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code } }, { status }))
      .mockRejectedValue(new TypeError("response lost"));
    vi.stubGlobal("fetch", fetcher);
    render(<ProjectBriefGenerationAction projectId={projectId} />);
    await clickGenerate(); await screen.findByRole("alert");
    const failed = JSON.parse(fetcher.mock.calls[0][1].body);
    await clickGenerate(); await screen.findByRole("alert");
    const retried = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(retried.rangeStart).toBe(failed.rangeStart);
    expect(retried.rangeEnd).toBe(failed.rangeEnd);
    expect(retried.requestKey).not.toBe(failed.requestKey);
    await clickGenerate(); await screen.findByRole("alert");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(retried);
  });

  it("退款结果未确认时仍保留原key，不把不确定失败当成安全新尝试", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code: "reservation_release_failed" } }, { status: 502 }))
      .mockRejectedValue(new TypeError("response lost"));
    vi.stubGlobal("fetch", fetcher);
    render(<ProjectBriefGenerationAction projectId={projectId} />);
    await clickGenerate(); await screen.findByRole("alert");
    const original = JSON.parse(fetcher.mock.calls[0][1].body);
    await clickGenerate(); await screen.findByRole("alert");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(original);
  });
});
