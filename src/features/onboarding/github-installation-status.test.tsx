import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubInstallationStatus } from "./github-installation-status";

function statusValue(label: string) {
  const term = screen.getByText(label, { exact: true, selector: "dt" });
  return term.parentElement?.querySelector("dd");
}

afterEach(cleanup);

describe("GitHub App installation status UI", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps login, installation, and repository access as separate states", () => {
    render(
      <GitHubInstallationStatus
        authenticated
        installationStatus="active"
      />,
    );

    expect(screen.getByText("true", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("active", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("not_loaded", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "加载已授权仓库" }),
    ).toBeInTheDocument();
    expect(statusValue("selected_repository_count")).toHaveTextContent(
      "unknown",
    );
    expect(statusValue("calibration_status")).toHaveTextContent("unknown");
    expect(statusValue("projects")).toHaveTextContent("unknown");
    expect(statusValue("repository_content")).toHaveTextContent("none");
    expect(
      screen.getByText("GitHub App Installation 已连接"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "安装只读 GitHub App" }),
    ).not.toBeInTheDocument();
  });

  it("offers installation only to an authenticated user without a registration", () => {
    render(
      <GitHubInstallationStatus
        authenticated
        installationStatus="not_registered"
      />,
    );

    expect(
      screen.getByRole("link", { name: "安装只读 GitHub App" }),
    ).toHaveAttribute(
      "href",
      "/api/github/installations/start?returnTo=%2Fonboarding",
    );
    expect(screen.queryByText("仓库正在加载")).not.toBeInTheDocument();
    expect(screen.getByText("已选择仓库正在恢复")).toBeInTheDocument();
  });

  it.each([
    ["suspended", "GitHub App Installation 已暂停"],
    ["revoked", "GitHub App Installation 已撤销"],
    ["configuration_failed", "GitHub App Installation 配置失败"],
  ] as const)("renders the stable %s state", (status, message) => {
    render(
      <GitHubInstallationStatus
        authenticated
        installationStatus={status}
      />,
    );

    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
