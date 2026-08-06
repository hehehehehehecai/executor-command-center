import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectFreshnessPresentationInput } from "./freshness-presentation";
import { SyncStatusBadge } from "./SyncStatusBadge";

const baseInput: ProjectFreshnessPresentationInput = {
  provenance: "demo",
  authorizationRevoked: false,
  latestRun: {
    id: "22222222-2222-4222-8222-222222222222",
    status: "completed",
    finishedAt: "2026-08-06T10:00:00.000Z",
    errorCode: null,
  },
  lastSuccessfulAt: "2026-08-06T10:00:00.000Z",
  coverageComplete: true,
  now: "2026-08-06T12:00:00.000Z",
};

describe("SyncStatusBadge", () => {
  afterEach(cleanup);

  it("renders visible, semantic Freshness and absolute time text", () => {
    render(<SyncStatusBadge input={baseInput} />);

    expect(screen.getByText("Fresh")).toBeVisible();
    expect(screen.getByText("演示数据 · 完全虚构")).toBeVisible();
    expect(screen.getByText("2026-08-06 10:00:00 UTC")).toHaveAttribute(
      "dateTime",
      "2026-08-06T10:00:00.000Z",
    );
  });

  it("renders a visible current run for running without exposing the full id", () => {
    render(
      <SyncStatusBadge
        input={{
          ...baseInput,
          latestRun: {
            id: "33333333-3333-4333-8333-333333333333",
            status: "running",
            finishedAt: null,
            errorCode: null,
          },
        }}
      />,
    );

    expect(screen.getByText("Syncing")).toBeVisible();
    expect(screen.getByText("running · 33333333…")).toBeVisible();
    expect(screen.queryByText(/33333333-3333/)).not.toBeInTheDocument();
  });

  it("renders a strict greater-than-24-hours warning", () => {
    const { rerender } = render(
      <SyncStatusBadge
        input={{ ...baseInput, lastSuccessfulAt: "2026-08-05T12:00:00.000Z" }}
      />,
    );

    expect(screen.queryByText("数据已超过 24 小时未成功同步。")).not.toBeInTheDocument();

    rerender(
      <SyncStatusBadge
        input={{ ...baseInput, lastSuccessfulAt: "2026-08-05T11:59:59.999Z" }}
      />,
    );
    expect(screen.getByText("数据已超过 24 小时未成功同步。")).toBeVisible();
  });

  it("renders never-synced and authorization-revoked guidance", () => {
    const { rerender } = render(
      <SyncStatusBadge input={{ ...baseInput, lastSuccessfulAt: null }} />,
    );
    expect(screen.getByText("尚无成功同步记录。")).toBeVisible();

    rerender(
      <SyncStatusBadge input={{ ...baseInput, authorizationRevoked: true }} />,
    );
    expect(screen.getByText("Authorization revoked")).toBeVisible();
    expect(screen.getByText("GitHub 授权已撤销，同步已停止。")).toBeVisible();
  });

  it("renders an allowlisted code and never leaks unknown code or errorSummary", () => {
    const inputWithUnsafeExtra = {
      ...baseInput,
      latestRun: {
        id: "failed-run",
        status: "failed" as const,
        finishedAt: "2026-08-06T11:00:00.000Z",
        errorCode: "provider_internal_token_secret",
        errorSummary: "Authorization: Bearer never-render-this",
      },
    };
    const { rerender } = render(<SyncStatusBadge input={inputWithUnsafeExtra} />);

    expect(screen.getByText("sync_error")).toBeVisible();
    expect(screen.queryByText(/provider_internal|Bearer|never-render/)).not.toBeInTheDocument();

    rerender(
      <SyncStatusBadge
        input={{
          ...baseInput,
          latestRun: {
            id: "failed-run",
            status: "failed",
            finishedAt: "2026-08-06T11:00:00.000Z",
            errorCode: "github_activity_rate_limited",
          },
        }}
      />,
    );
    expect(screen.getByText("github_activity_rate_limited")).toBeVisible();
  });
});
