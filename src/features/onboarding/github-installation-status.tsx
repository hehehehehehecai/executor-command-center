"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { AuthorizedRepositoryList } from "./authorized-repository-list";
import { ProjectCalibrationPanel } from "./project-calibration-panel";
import { installationManagementRefreshedEvent } from "./onboarding-events";
import { safeReturnTo } from "@/application/auth/safe-return-to";

export type GitHubInstallationUiStatus =
  | "not_registered"
  | "active"
  | "suspended"
  | "revoked"
  | "configuration_failed"
  | "read_failed";

const statusMessage: Record<GitHubInstallationUiStatus, string> = {
  not_registered: "尚未连接 GitHub App",
  active: "GitHub App Installation 已连接",
  suspended: "GitHub App Installation 已暂停",
  revoked: "GitHub App Installation 已撤销",
  configuration_failed: "GitHub App Installation 配置失败",
  read_failed: "GitHub App 状态读取失败，请刷新重试。",
};

type Props = {
  readonly authenticated: boolean;
  readonly userId?: string | null;
  readonly installationStatus: GitHubInstallationUiStatus;
  readonly onboarding?: boolean;
  readonly primaryActions?: boolean;
  readonly returnTo?: string;
};

const managementViewSchema = z.object({
  version: z.literal("github-installation-management.v1"),
  subjectId: z.string().uuid(),
  status: z.enum(["active", "suspended", "revoked", "not_registered"]),
  canSelectRepositories: z.boolean(),
  reconnectRequired: z.boolean(),
  managementUrl: z.string().nullable(),
  managementError: z.literal("installation_management_address_unavailable").nullable(),
}).strict();

const refreshErrors: Record<string, string> = {
  unauthenticated: "登录已失效，请重新登录。",
  installation_context_changed: "账号状态已变化，请刷新页面重新确认。",
  github_api_timeout: "GitHub 响应超时，请重试。",
  github_api_rate_limited: "GitHub 请求过于频繁，请稍后重试。",
  github_api_forbidden: "GitHub 暂不允许读取此安装，请检查授权后重试。",
  github_app_configuration_missing: "GitHub App 配置暂不可用，请稍后重试。",
  unsupported_installation_account_type: "当前仅支持个人 GitHub 账号，请使用个人账号连接。",
};

export function GitHubInstallationStatus(input: Props) {
  return <InstallationManagement key={`${input.authenticated}:${input.userId ?? "unknown"}:${input.installationStatus}`} {...input} />;
}

function InstallationManagement(input: Props) {
  const mounted = useRef(false);
  const busy = useRef(false);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [view, setView] = useState<z.infer<typeof managementViewSchema> | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const end = () => { mounted.current = false; setSessionEnded(true); };
    window.addEventListener("executor:session-ended", end);
    return () => { mounted.current = false; window.removeEventListener("executor:session-ended", end); };
  }, []);
  const status = checking || failure ? "read_failed" : view?.status ?? input.installationStatus;
  const primary = input.onboarding && input.primaryActions !== false;
  async function refresh() {
    if (!mounted.current || busy.current || !input.authenticated) return;
    busy.current = true;
    setChecking(true);
    setView(null);
    setFailure(null);
    window.dispatchEvent(new CustomEvent(installationManagementRefreshedEvent, { detail: { subjectId: input.userId, status: "loading" } }));
    try {
      const response = await fetch("/api/github/installations/current", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.code ?? "installation_read_failed");
      const parsed = managementViewSchema.safeParse(payload);
      if (!parsed.success) throw new Error("installation_read_failed");
      if (parsed.data.subjectId !== input.userId) throw new Error("installation_context_changed");
      if (!mounted.current) return;
      setView(parsed.data);
      setRefreshCount(count => count + 1);
      window.dispatchEvent(new CustomEvent(installationManagementRefreshedEvent, { detail: { subjectId: parsed.data.subjectId, status: parsed.data.status } }));
    } catch (error) {
      if (!mounted.current) return;
      setFailure(refreshErrors[error instanceof Error ? error.message : ""] ?? "授权状态读取失败，请重试。");
      window.dispatchEvent(new CustomEvent(installationManagementRefreshedEvent, { detail: { subjectId: input.userId, status: "read_failed" } }));
    } finally {
      if (mounted.current) { busy.current = false; setChecking(false); }
    }
  }
  if (sessionEnded) return <p role="alert">会话已结束，请重新登录。</p>;
  const installationReturn = safeReturnTo(input.returnTo);
  const installationHref = `/api/github/installations/start?returnTo=${encodeURIComponent(installationReturn === "/onboarding" ? installationReturn : `/onboarding?returnTo=${encodeURIComponent(installationReturn)}`)}`;
  return (
    <section id="repositories" aria-label="添加仓库与授权管理">
      <details open={input.onboarding ? undefined : true}><summary>接入诊断</summary><dl className="auth-state-list">
        <div>
          <dt>authenticated</dt>
          <dd>{String(input.authenticated)}</dd>
        </div>
        <div>
          <dt>github_app_installation</dt>
          <dd>{status}</dd>
        </div>
        {status === "not_registered" ||
        status === "configuration_failed" ? (
          <div>
            <dt>repository_access</dt>
            <dd>not_loaded</dd>
          </div>
        ) : null}
      </dl></details>
      <p>{checking ? "正在核验 GitHub 安装与当前账号…" : statusMessage[status]}</p>
      <p>当前仅支持个人 GitHub 账号。仓库授权变更后，请返回此页刷新。</p>
      {failure ? <p role="alert">{failure}</p> : null}
      {input.authenticated ? <div>
        {(status === "active" || status === "suspended") && !view?.managementError ? <a data-onboarding-primary={primary && status === "suspended" && !view?.reconnectRequired ? "true" : undefined} href="/api/github/installations/manage" target="_blank" rel="noopener noreferrer">管理 GitHub 仓库授权</a> : null}
        {view?.managementError ? <p role="alert">GitHub 未提供可验证的管理地址，请稍后刷新重试。</p> : null}
        {status === "suspended" ? <p>请在 GitHub 安装设置中恢复授权；若由应用维护者暂停，请联系维护者处理。</p> : null}
        {status === "revoked" || status === "not_registered" || status === "configuration_failed" || view?.reconnectRequired ? <Link data-onboarding-primary={primary ? "true" : undefined} prefetch={false} href={installationHref}>{view?.reconnectRequired ? "重新确认 GitHub 连接" : status === "revoked" ? "重新安装 GitHub App" : "安装只读 GitHub App"}</Link> : null}
        <button data-onboarding-primary={primary && (status === "read_failed" || status === "suspended" && view?.managementError) ? "true" : undefined} type="button" disabled={checking} aria-busy={checking} onClick={() => void refresh()}>已返回，刷新授权和仓库</button>
      </div> : null}
      {input.authenticated && status !== "read_failed" ? (
        <>
          <AuthorizedRepositoryList
            key={`repositories:${refreshCount}`}
            userId={input.userId}
            installationStatus={view?.reconnectRequired ? "suspended" : status}
            autoLoad={refreshCount > 0 && view?.canSelectRepositories === true}
            onboarding={input.onboarding}
            primaryActions={input.primaryActions}
          />
              {input.onboarding ? <details><summary>可选：补充项目背景</summary><ProjectCalibrationPanel key={`projects:${refreshCount}`} /></details> : <ProjectCalibrationPanel key={`projects:${refreshCount}`} />}
        </>
      ) : (
        <details open={input.onboarding ? undefined : true}><summary>仓库诊断</summary><dl className="auth-state-list">
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
            <dd>unknown</dd>
          </div>
        </dl></details>
      )}
    </section>
  );
}
