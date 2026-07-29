import Link from "next/link";

import { AuthorizedRepositoryList } from "./authorized-repository-list";

export type GitHubInstallationUiStatus =
  | "not_registered"
  | "active"
  | "suspended"
  | "revoked"
  | "configuration_failed";

const statusMessage: Record<GitHubInstallationUiStatus, string> = {
  not_registered: "尚未连接 GitHub App",
  active: "GitHub App Installation 已连接",
  suspended: "GitHub App Installation 已暂停",
  revoked: "GitHub App Installation 已撤销",
  configuration_failed: "GitHub App Installation 配置失败",
};

export function GitHubInstallationStatus(input: {
  readonly authenticated: boolean;
  readonly installationStatus: GitHubInstallationUiStatus;
}) {
  return (
    <>
      <dl className="auth-state-list">
        <div>
          <dt>authenticated</dt>
          <dd>{String(input.authenticated)}</dd>
        </div>
        <div>
          <dt>github_app_installation</dt>
          <dd>{input.installationStatus}</dd>
        </div>
        {input.installationStatus === "not_registered" ||
        input.installationStatus === "configuration_failed" ? (
          <div>
            <dt>repository_access</dt>
            <dd>not_loaded</dd>
          </div>
        ) : null}
      </dl>
      <p>{statusMessage[input.installationStatus]}</p>
      {input.authenticated ? (
        <AuthorizedRepositoryList
          installationStatus={input.installationStatus}
        />
      ) : (
        <dl className="auth-state-list">
          <div>
            <dt>selected_repository_count</dt>
            <dd>unknown</dd>
          </div>
          <div>
            <dt>calibration_status</dt>
            <dd>pending</dd>
          </div>
          <div>
            <dt>projects</dt>
            <dd>none</dd>
          </div>
        </dl>
      )}
      {input.authenticated &&
      input.installationStatus === "not_registered" ? (
        <Link href="/api/github/installations/start?returnTo=%2Fonboarding">
          安装只读 GitHub App
        </Link>
      ) : null}
    </>
  );
}
