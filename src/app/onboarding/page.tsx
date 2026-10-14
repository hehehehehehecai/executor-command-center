import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AccountDeletionPanel,
  GitHubInstallationStatus,
  type GitHubInstallationUiStatus,
} from "@/features/onboarding";
import { readWorkspaceContext } from "@/infrastructure/workspace/workspace-server-context";
import { AccountIdentity } from "@/features/onboarding/account-identity";
import { WorkspaceSessionBoundary } from "@/features/onboarding/workspace-session-boundary";
import { OnboardingProjectEntry } from "@/features/onboarding/onboarding-project-entry";
import { OnboardingReadRetry, OnboardingRepositoryDisclosure } from "@/features/onboarding/onboarding-read-retry";
import { resolveOnboardingReturnTarget } from "@/features/onboarding/onboarding-return-target";
import { safeReturnTo } from "@/application/auth/safe-return-to";
import styles from "./onboarding.module.css";

export const dynamic = "force-dynamic";

export default async function OnboardingPage(input: {
  readonly searchParams: Promise<{
    installation?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const workspace = await readWorkspaceContext();
  const authenticated = workspace.status === "authenticated";
  const authenticatedUserId = authenticated ? workspace.userId : null;
  let installationStatus: GitHubInstallationUiStatus = authenticated && workspace.installation.status === "ready"
    ? workspace.installation.data?.status ?? "not_registered" : "read_failed";

  const searchParams = await input.searchParams;
  const returnTo = typeof searchParams.returnTo === "string" ? searchParams.returnTo : undefined;
  const target = resolveOnboardingReturnTarget(workspace, returnTo);
  if (target.path && workspace.status === "authenticated" && workspace.identity.status === "ready") redirect(target.path);
  if (
    authenticated &&
    installationStatus === "not_registered" &&
    searchParams.installation === "configuration_failed"
  ) {
    installationStatus = "configuration_failed";
  }

  const projects = workspace.status === "authenticated" && workspace.projects.status === "ready" ? workspace.projects.data : [];
  const projectReadFailed = workspace.status === "authenticated" && workspace.projects.status === "failed";
  const identityReadFailed = workspace.status === "authenticated" && workspace.identity.status === "failed";
  const management = <GitHubInstallationStatus authenticated={authenticated} userId={authenticatedUserId} installationStatus={installationStatus} onboarding primaryActions={projects.length === 0} returnTo={returnTo} />;
  return (
    <WorkspaceSessionBoundary key={authenticatedUserId ?? workspace.status} workspace={workspace} preserveOnboardingQuery><main id="main-content" className={`auth-status-shell ${styles.shell}`} tabIndex={-1}>
      <p className="section-kicker">GitHub 账号接入</p>
      <h1>{authenticated ? "GitHub 身份登录成功" : workspace.status === "unavailable" ? "暂时无法确认登录状态" : "尚未登录"}</h1>
      <AccountIdentity key={authenticatedUserId ?? "anonymous"} workspace={workspace} onboarding returnTo={safeReturnTo(returnTo)} />
      {target.rejected || Array.isArray(searchParams.returnTo) ? <p role="alert" aria-label="返回目标不可用">返回目标不可用，请从当前账号的项目中选择。</p> : null}
      {workspace.status === "unavailable" ? <OnboardingReadRetry /> : identityReadFailed ? <div role="alert" aria-label="账号资料读取失败"><p>GitHub 账号资料读取失败，请重新读取确认当前身份。</p><OnboardingReadRetry /></div> : projectReadFailed ? <div role="alert" aria-label="项目读取失败"><p>项目列表读取失败，暂时无法确认已有项目。请重试，已有资料会保留。</p><OnboardingReadRetry /></div> : authenticated ? projects.length > 0 ? <>
        <OnboardingProjectEntry key={authenticatedUserId} projects={projects} />
        <OnboardingRepositoryDisclosure>{management}</OnboardingRepositoryDisclosure>
      </> : <><h2>{installationStatus === "active" ? "添加你的项目" : "连接 GitHub 仓库"}</h2>{management}</> : null}
      {authenticatedUserId ? <details><summary>账号操作</summary><AccountDeletionPanel key={authenticatedUserId} userId={authenticatedUserId} /></details> : null}
      <Link href="/">返回 Command Deck</Link>
    </main></WorkspaceSessionBoundary>
  );
}
