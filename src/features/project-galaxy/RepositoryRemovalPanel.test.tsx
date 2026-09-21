import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepositoryRemovalPanel } from "./RepositoryRemovalPanel";

const projectId = "22222222-2222-4222-8222-222222222222";

afterEach(cleanup);

function completed(mode: "REMOVE_REPOSITORY_DATA" | "DELETE_PROJECT_SUBTREE") {
  return {
    operation: {
      operationId: "33333333-3333-4333-8333-333333333333",
      projectId,
      mode,
      status: "completed",
      outcome: "executed",
      counts: {
        deleted: { github_commits: 2, projects: mode === "DELETE_PROJECT_SUBTREE" ? 1 : 0 },
        preserved: { projects: mode === "REMOVE_REPOSITORY_DATA" ? 1 : 0 },
        invalidated: { evidence_links: 3 },
      },
      safelyRetryable: true,
      completedAt: "2026-08-24T09:00:00.000Z",
    },
  };
}

describe("RepositoryRemovalPanel", () => {
  it("contains focus and background interaction, then restores the trigger after Escape", () => {
    render(<RepositoryRemovalPanel projectId={projectId} />);
    const trigger = screen.getByRole("button", { name: "移除仓库数据" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "确认移除仓库数据" });
    const confirmation = within(dialog).getByRole("textbox", { name: "确认文本" });
    const cancel = within(dialog).getByRole("button", { name: "取消" });
    expect(confirmation).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(confirmation).toHaveFocus();

    expect(trigger.closest("[inert]")).not.toBeNull();
    trigger.focus();
    expect(confirmation).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.querySelector("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("shows two distinct destructive meanings without promising app/account removal", () => {
    render(<RepositoryRemovalPanel projectId={projectId} />);
    expect(
      screen.getByRole("button", { name: "移除仓库数据" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "删除整个项目" }),
    ).toBeVisible();
    expect(screen.getByText(/不会撤销 GitHub App/)).toBeVisible();
    expect(screen.getByText(/不会删除账户/)).toBeVisible();
  });

  it("cancels confirmation with zero network side effects", () => {
    const fetcher = vi.fn();
    render(<RepositoryRemovalPanel projectId={projectId} fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: "删除整个项目" }));
    const dialog = screen.getByRole("dialog", { name: "确认删除整个项目" });
    expect(within(dialog).getByText(`DELETE ${projectId}`)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("binds mode, project and exact confirmation and waits for server completion", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn(
      () => new Promise<Response>((resolve) => { resolveResponse = resolve; }),
    );
    render(
      <RepositoryRemovalPanel
        projectId={projectId}
        fetcher={fetcher}
        createIdempotencyKey={() => "phase6-ui:request-1"}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "移除仓库数据" }));
    const dialog = screen.getByRole("dialog", { name: "确认移除仓库数据" });
    const submit = within(dialog).getByRole("button", { name: "确认移除仓库数据" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("确认文本"), {
      target: { value: `REMOVE ${projectId}` },
    });
    fireEvent.click(submit);
    expect(within(dialog).getByRole("button", { name: "处理中" })).toBeDisabled();
    expect(screen.queryByText(/已完成/)).not.toBeInTheDocument();

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/projects/${projectId}/repository-removal`);
    expect(JSON.parse(String(init.body))).toEqual({
      projectId,
      mode: "REMOVE_REPOSITORY_DATA",
      idempotencyKey: "phase6-ui:request-1",
      confirmation: { projectId, text: `REMOVE ${projectId}` },
    });

    resolveResponse(Response.json(completed("REMOVE_REPOSITORY_DATA")));
    await waitFor(() => {
      expect(screen.getByText("仓库数据已移除")).toBeVisible();
    });
    expect(screen.getByText(/3 条 Evidence Link/)).toBeVisible();
    expect(screen.getByText(/SOURCE_REMOVED/)).toBeVisible();
  });

  it("keeps the same idempotency key for a safe retry after failure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: "repository_removal_storage_failed", message: "safe" } },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(Response.json(completed("DELETE_PROJECT_SUBTREE")));
    render(
      <RepositoryRemovalPanel
        projectId={projectId}
        fetcher={fetcher}
        createIdempotencyKey={() => "phase6-ui:retry-1"}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除整个项目" }));
    fireEvent.change(screen.getByLabelText("确认文本"), {
      target: { value: `DELETE ${projectId}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认删除整个项目" }));
    expect(await screen.findByText(/可以安全重试/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("项目已删除")).toBeVisible();

    const bodies = fetcher.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0].idempotencyKey).toBe("phase6-ui:retry-1");
    expect(bodies[1].idempotencyKey).toBe("phase6-ui:retry-1");
  });
});


describe("RepositoryRemovalPanel theme contract", () => {
  it.each([
    ["REMOVE_REPOSITORY_DATA", "移除仓库数据", "REMOVE", "DELETE"],
    ["DELETE_PROJECT_SUBTREE", "删除整个项目", "DELETE", "REMOVE"],
  ] as const)("rejects mismatched confirmation for %s", (_mode, action, verb, wrongVerb) => {
    const fetcher = vi.fn();
    render(<RepositoryRemovalPanel projectId={projectId} fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: action }));
    const dialog = screen.getByRole("dialog", { name: `确认${action}` });
    const input = within(dialog).getByRole("textbox", { name: "确认文本" });
    const submit = within(dialog).getByRole("button", { name: `确认${action}` });

    for (const text of [`${wrongVerb} ${projectId}`, `${verb} 99999999-9999-4999-8999-999999999999`, ` ${verb} ${projectId}`]) {
      fireEvent.change(input, { target: { value: text } });
      expect(submit).toBeDisabled();
      fireEvent.click(submit);
    }
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: `${verb} ${projectId}` } });
    expect(submit).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("exposes a non-retryable authorization failure without success", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(
      { error: { code: "repository_removal_not_found", message: "safe" } },
      { status: 404 },
    ));
    render(<RepositoryRemovalPanel projectId={projectId} fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: "删除整个项目" }));
    fireEvent.change(screen.getByLabelText("确认文本"), { target: { value: `DELETE ${projectId}` } });
    fireEvent.click(screen.getByRole("button", { name: "确认删除整个项目" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("项目不存在、已删除，或当前账户无权操作");
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "确认文本" })).toHaveValue(`DELETE ${projectId}`);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "确认删除整个项目" })).toBeVisible();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects an unverified completion for another project", async () => {
    const payload = completed("REMOVE_REPOSITORY_DATA");
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      ...payload,
      operation: { ...payload.operation, projectId: "99999999-9999-4999-8999-999999999999" },
    }));
    render(<RepositoryRemovalPanel projectId={projectId} fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: "移除仓库数据" }));
    fireEvent.change(screen.getByLabelText("确认文本"), { target: { value: `REMOVE ${projectId}` } });
    fireEvent.click(screen.getByRole("button", { name: "确认移除仓库数据" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("服务器返回了无法验证的结果，可以安全重试");
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("仓库数据已移除")).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
