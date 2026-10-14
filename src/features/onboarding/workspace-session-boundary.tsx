"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkspaceContext } from "@/application/workspace/load-workspace-context";
import { safeReturnTo } from "@/application/auth/safe-return-to";
import { featureRegistry } from "@/shared/features/feature-registry";

const replaceDocument = (path: string) => window.location.replace(path);

export function WorkspaceSessionBoundary({ workspace, children, fetcher = fetch, navigate = replaceDocument, preserveOnboardingQuery = false, preserveWorkspaceQuery = false }: {
  readonly workspace: WorkspaceContext;
  readonly children: ReactNode;
  readonly fetcher?: typeof fetch;
  readonly navigate?: (path: string) => void;
  readonly preserveOnboardingQuery?: boolean;
  readonly preserveWorkspaceQuery?: boolean;
}) {
  const [verified, setVerified] = useState(workspace.status !== "authenticated");
  const [failed, setFailed] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const active = useRef(true);
  const sessionEnded = useRef(false);
  const signature = JSON.stringify(workspace);
  const revalidate = useCallback(async () => {
    if (sessionEnded.current) return;
    const current = ++generation.current;
    if (content.current) content.current.hidden = true;
    setVerified(false);
    setFailed(false);
    try {
      const response = await fetcher("/api/auth/workspace", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.workspace) throw new Error("workspace_verification_failed");
      if (!active.current || current !== generation.current) return;
      if (JSON.stringify(result.workspace) !== signature) {
        const sameAccount = workspace.status === "authenticated" && result.workspace.status === "authenticated" && result.workspace.userId === workspace.userId;
        const url = new URL(window.location.href);
        const target = url.pathname === "/" ? "home" : featureRegistry.find(feature => feature.route === url.pathname)?.id;
        // These pages validate the entire query and ownership on the server.
        // Keep a denied target so removing its ID cannot select another project.
        const destination = (preserveOnboardingQuery && sameAccount && url.pathname === "/onboarding") || (preserveWorkspaceQuery && sameAccount && target)
          ? safeReturnTo(window.location.pathname + window.location.search + window.location.hash)
          : window.location.pathname;
        navigate(destination);
        return;
      }
      const url = new URL(window.location.href);
      const projects = workspace.status === "authenticated" && workspace.projects.status === "ready" ? workspace.projects.data : [];
      let changed = false;
      for (const key of workspace.status === "authenticated" && workspace.projects.status === "ready" && (!preserveWorkspaceQuery || projects.length === 0) ? ["project", "projectId", "fromProjectId"] : []) {
        const value = url.searchParams.get(key);
        if (value && !projects.some(project => project.id === value)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) { navigate(url.pathname + url.search); return; }
      if (content.current) content.current.hidden = false;
      setVerified(true);
    } catch {
      if (active.current && current === generation.current) setFailed(true);
    }
  }, [fetcher, navigate, signature, workspace, preserveOnboardingQuery, preserveWorkspaceQuery]);
  useEffect(() => {
    active.current = true;
    // Public preview and a configuration error must remain usable without an auth service.
    if (workspace.status === "unavailable") return;
    const invalidate = () => { ++generation.current; };
    const hide = () => {
      invalidate();
      if (content.current) content.current.hidden = true;
      setVerified(false);
    };
    const refresh = () => { void revalidate(); };
    const end = () => { sessionEnded.current = true; hide(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    if (workspace.status === "authenticated") refresh();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("executor:session-ended", end);
    document.addEventListener("visibilitychange", visible);
    let channel: BroadcastChannel | null = null;
    try { if (typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel("executor-workspace-session"); }
    catch { /* Focus/pageshow revalidation also works when channels are unavailable. */ }
    if (channel) channel.onmessage = () => { hide(); refresh(); };
    return () => {
      active.current = false;
      // Cleanup also runs during StrictMode's mount probe; it must not hide UI.
      invalidate();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("executor:session-ended", end);
      document.removeEventListener("visibilitychange", visible);
      channel?.close();
    };
  }, [revalidate, workspace.status]);
  return <>{!verified ? failed ? <div role="alert">暂时无法确认当前账号，内容已隐藏。<button type="button" onClick={() => void revalidate()}>重试验证</button></div> : <p role="status">正在确认当前账号…</p> : null}<div ref={content} hidden={!verified}>{children}</div></>;
}
