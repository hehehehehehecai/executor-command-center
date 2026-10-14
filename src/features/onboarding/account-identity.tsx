"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { projectBackgroundSchema } from "@/domain/project-calibration/project-calibration-read";
import type { WorkspaceContext } from "@/application/workspace/load-workspace-context";
import { GitHubSignInLink } from "./github-sign-in-link";
import styles from "./account-identity.module.css";
import { installationManagementRefreshedEvent } from "./onboarding-events";

const replaceDocument = (path: string) => window.location.replace(path);

const failedRead = z.object({ status: z.literal("failed") }).strict();
const refreshedSummarySchema = z.object({
  status: z.literal("authenticated"), userId: z.string().min(1),
  installation: z.union([failedRead, z.object({ status: z.literal("ready"), data: z.object({ status: z.enum(["active", "suspended", "revoked"]) }).strict().nullable() }).strict()]),
  projects: z.union([failedRead, z.object({ status: z.literal("blocked") }).strict(), z.object({ status: z.literal("ready"), data: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), status: projectBackgroundSchema.shape.status }).strict()) }).strict()]),
});
const refreshedEventSchema = z.object({ subjectId: z.string(), status: z.enum(["active", "suspended", "revoked", "not_registered", "loading", "read_failed"]) }).strict();
type Summary = { signature: string } & ({ kind: "loading" | "failed" } | { kind: "ready"; data: z.infer<typeof refreshedSummarySchema> });

export function AccountIdentity({ workspace: initialWorkspace, fetcher = fetch, navigate = replaceDocument, onboarding = false, returnTo }: {
  readonly workspace: WorkspaceContext;
  readonly fetcher?: typeof fetch;
  readonly navigate?: (path: string) => void;
  readonly onboarding?: boolean;
  readonly returnTo?: string;
}) {
  const [state, setState] = useState<"idle" | "pending" | "failed" | "done">("idle");
  const [summary, setSummary] = useState<Summary | null>(null);
  const ending = useRef(false);
  const signature = JSON.stringify(initialWorkspace);
  const userId = initialWorkspace.status === "authenticated" ? initialWorkspace.userId : null;
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = async (event: Event) => {
      const parsedEvent = refreshedEventSchema.safeParse((event as CustomEvent).detail);
      if (!userId || ending.current || !parsedEvent.success || parsedEvent.data.subjectId !== userId) return;
      const current = ++generation;
      if (parsedEvent.data.status === "read_failed") { setSummary({ signature, kind: "failed" }); return; }
      setSummary({ signature, kind: "loading" });
      if (parsedEvent.data.status === "loading") return;
      try {
        const response = await fetcher("/api/auth/workspace", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error("workspace_summary_failed");
        const result = refreshedSummarySchema.safeParse((await response.json()).workspace);
        if (!result.success || result.data.userId !== userId) throw new Error("workspace_summary_subject_changed");
        if (!active || current !== generation || ending.current) return;
        const remoteStatus = parsedEvent.data.status;
        // A verified remote suspension/404 must not be hidden by an older local record.
        const data = remoteStatus === "suspended" || remoteStatus === "revoked"
          ? { ...result.data, installation: { status: "ready" as const, data: { status: remoteStatus } }, projects: { status: "blocked" as const } }
          : result.data;
        setSummary({ signature, kind: "ready", data });
      } catch {
        if (active && current === generation && !ending.current) setSummary({ signature, kind: "failed" });
      }
    };
    const invalidate = () => { ++generation; };
    window.addEventListener(installationManagementRefreshedEvent, refresh);
    window.addEventListener("executor:session-ended", invalidate);
    return () => { active = false; invalidate(); window.removeEventListener(installationManagementRefreshedEvent, refresh); window.removeEventListener("executor:session-ended", invalidate); };
  }, [fetcher, signature, userId]);
  const currentSummary = summary?.signature === signature ? summary : null;
  const workspace: WorkspaceContext = initialWorkspace.status === "authenticated" && currentSummary
    ? { ...initialWorkspace, installation: currentSummary.kind === "ready" ? currentSummary.data.installation : { status: "failed" }, projects: currentSummary.kind === "ready" ? currentSummary.data.projects : { status: "failed" } }
    : initialWorkspace;
  async function signOut() {
    ending.current = true;
    setState("pending");
    try {
      const response = await fetcher("/api/auth/sign-out", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.signedOut !== true) throw new Error("sign_out_failed");
    } catch { ending.current = false; setState("failed"); return; }
    setState("done");
    window.dispatchEvent(new Event("executor:session-ended"));
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("executor-workspace-session");
        channel.postMessage("session-ended");
        channel.close();
      }
    } catch { /* Cross-tab notification is optional; the successful logout is authoritative. */ }
    // A document replacement drops the router cache, selection state and project URL parameters.
    navigate("/?signedOut=1");
  }
  if (workspace.status === "unavailable") return <aside className={styles.account} aria-label="当前账号"><p role="alert">{workspace.reason === "configuration_missing" ? "账号服务尚未配置，暂时无法确认身份。" : "暂时无法验证登录状态，请稍后刷新重试。"}</p><Link href="/onboarding" prefetch={false}>添加仓库</Link></aside>;
  if (workspace.status === "signed_out") return <aside className={styles.account} aria-label="当前账号"><span>{workspace.reason === "invalid_session" ? "登录已失效，请重新登录。" : "尚未登录"}</span><GitHubSignInLink returnTo={returnTo} primary={onboarding} />{!onboarding ? <a href="/api/auth/github?returnTo=%2Fonboarding">添加仓库</a> : null}</aside>;
  const login = workspace.identity.status === "ready" ? workspace.identity.data.login : null;
  const installation = workspace.installation.status === "ready" ? workspace.installation.data?.status ?? "none" : "failed";
  const labels = { active: "GitHub App 已连接", suspended: "GitHub App 已暂停", revoked: "GitHub App 已撤销", none: "尚未连接 GitHub App", failed: "GitHub App 状态读取失败" };
  return <aside className={styles.account} aria-label="当前账号" data-workspace-account={workspace.userId}>
    <span className={styles.avatar} aria-hidden="true">{login?.slice(0, 1).toUpperCase() ?? "?"}</span>
    <div><strong>GitHub 身份已登录</strong><p className={styles.login}>{login ? `@${login}` : "GitHub 身份资料暂不可用"}</p><small>{currentSummary?.kind === "loading" ? "正在刷新 GitHub App 状态…" : labels[installation]}</small></div>
    {!onboarding ? workspace.projects.status === "ready" ? <details><summary>我的项目（{workspace.projects.data.length}）</summary>{workspace.projects.data.length ? <ul>{workspace.projects.data.map(project => <li key={project.id}>{project.name}</li>)}</ul> : <p>当前账号暂无项目</p>}</details> : <span role="status">{currentSummary?.kind === "loading" ? "正在刷新项目列表…" : workspace.projects.status === "blocked" ? "项目列表暂不可用，请先确认 GitHub App 状态。" : "项目列表读取失败，请刷新重试。"}</span> : null}
    {currentSummary?.kind === "failed" ? <p role="alert">账号摘要读取失败，请再次刷新授权。</p> : null}
    {!onboarding ? <><Link href="/onboarding" prefetch={false}>查看 GitHub App 状态</Link>
    <Link href="/onboarding#repositories" prefetch={false}>添加仓库</Link></> : null}
    <button type="button" onClick={signOut} disabled={state === "pending" || state === "done"} aria-busy={state === "pending"}>{state === "pending" ? "正在退出…" : "退出当前账号"}</button>
    {state === "failed" ? <p role="alert">退出失败，当前登录仍保留。请重试。</p> : null}
    {state === "done" ? <p role="status">已退出，正在返回首页。</p> : null}
  </aside>;
}
