import Link from "next/link";

export type GitHubInstallationUiStatus =
  | "not_registered"
  | "active"
  | "suspended"
  | "configuration_failed";

const statusMessage: Record<GitHubInstallationUiStatus, string> = {
  not_registered: "尚未连接 GitHub App",
  active: "GitHub App Installation 已连接",
  suspended: "GitHub App Installation 已暂停",
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
        <div>
          <dt>repository_access</dt>
          <dd>not_loaded</dd>
        </div>
        <div>
          <dt>selected_repositories</dt>
          <dd>none</dd>
        </div>
        <div>
          <dt>projects</dt>
          <dd>none</dd>
        </div>
      </dl>
      <p>{statusMessage[input.installationStatus]}</p>
      <p>仓库访问尚未读取，将在后续 Phase 单独完成。</p>
      {input.authenticated &&
      input.installationStatus === "not_registered" ? (
        <Link href="/api/github/installations/start?returnTo=%2Fonboarding">
          安装只读 GitHub App
        </Link>
      ) : null}
    </>
  );
}
