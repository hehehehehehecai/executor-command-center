import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountDeletionPanel } from "./AccountDeletionPanel";

const userId = "b3000000-0000-4000-8000-000000000001";
const operationId = "b3800000-0000-4000-8000-000000000001";

afterEach(cleanup);

describe("AccountDeletionPanel", () => {
  it("requires the current account identity and shows the seven-day recovery window", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ account: { status: "active" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ account: {
        operationId, status: "deletion_pending", outcome: "executed",
        requestedAt: "2026-08-25T06:00:00.000Z", dueAt: "2026-09-01T06:00:00.000Z", safelyRetryable: true,
      } }), { status: 202 }));
    render(<AccountDeletionPanel userId={userId} fetcher={fetcher} createIdempotencyKey={() => "phase3:ui"} />);
    await screen.findByText("账户当前为正常状态。");
    fireEvent.click(screen.getByRole("button", { name: "申请删除账户" }));
    const submit = screen.getByRole("button", { name: "确认申请删除" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("确认文本"), { target: { value: `DELETE ACCOUNT ${userId}` } });
    fireEvent.click(submit);
    await screen.findByText(/删除申请已生效/);
    expect(fetcher).toHaveBeenLastCalledWith("/api/account-deletion", expect.objectContaining({ method: "POST" }));
  });

  it("cancels without side effects before confirmation and supports pending cancellation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ account: {
      operationId, status: "deletion_pending", outcome: "replayed",
      requestedAt: "2026-08-25T06:00:00.000Z", dueAt: "2026-09-01T06:00:00.000Z", safelyRetryable: true,
    } }), { status: 200 }));
    render(<AccountDeletionPanel userId={userId} fetcher={fetcher} />);
    await screen.findByText(/删除申请已生效/);
    fireEvent.click(screen.getByRole("button", { name: "撤销删除申请" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/account-deletion", expect.objectContaining({ method: "DELETE" })));
  });
});
