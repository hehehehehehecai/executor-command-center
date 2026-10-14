"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectSyncStatusView } from "@/domain/synchronization/project-onboarding-sync";
import { readProjectSyncStatus, requestFirstSync } from "./first-sync-client";

const labels: Record<ProjectSyncStatusView["state"], string> = { not_started: "项目已建立，尚未开始首次同步", dispatch_pending: "同步任务已建立，正在等待派发", queued: "首次同步已排队", running: "首次同步正在进行", partial: "首次同步部分完成，可重试补全", completed: "首次同步已完成", failed: "首次同步失败，项目资料已保留", cancelled: "首次同步已取消，项目资料已保留", suspended: "GitHub 授权已暂停，请恢复授权后再同步", revoked: "GitHub 授权已撤销，请重新连接" };
export function FirstSyncStatusPanel({ projectId }: { readonly projectId: string }) { return <StatusPanel key={projectId} projectId={projectId} />; }
function StatusPanel({ projectId }: { readonly projectId: string }) {
  const [view, setView] = useState<ProjectSyncStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef(false), busy = useRef(false), generation = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    try { const result = await readProjectSyncStatus(projectId); if (active.current && token === generation.current) { setView(result); setError(null); } }
    catch { if (active.current && token === generation.current) { setView(null); setError("同步状态暂时无法读取，请刷新重试。项目资料不会丢失。"); } }
  }, [projectId]);
  useEffect(() => {
    active.current = true; queueMicrotask(() => { if (active.current) void refresh(); });
    const invalidate = () => { active.current = false; ++generation.current; };
    const end = () => { invalidate(); setView(null); setError("账号已变化，请重新加载页面。"); };
    window.addEventListener("executor:session-ended", end);
    return () => { invalidate(); window.removeEventListener("executor:session-ended", end); };
  }, [refresh]);
  async function start() {
    if (!active.current || busy.current || !view?.retryRequestId) return;
    busy.current = true; setPending(true); setError(null); ++generation.current;
    try {
      // Re-read before writing: a previous attempt may have completed while the UI was stale.
      const current = await readProjectSyncStatus(projectId);
      if (!active.current) return;
      setView(current);
      if (current.retryRequestId && !["running", "completed", "suspended", "revoked"].includes(current.state)) {
        try { await requestFirstSync(projectId, current.retryRequestId); }
        catch { if (active.current) setError("同步启动结果暂未确认，请刷新状态；项目资料已保留，可稍后重试。"); }
      }
      if (active.current) await refresh();
    } catch { if (active.current) setError("同步状态无法确认，请先刷新状态后再试。"); }
    finally { busy.current = false; if (active.current) setPending(false); }
  }
  return <section aria-label="首次同步状态">
    <p role="status">{view ? labels[view.state] : error ? "同步状态待确认" : "正在读取同步状态"}</p>
    {view?.finishedAt ? <p>本次结束于 {new Date(view.finishedAt).toLocaleString("zh-CN")}</p> : null}
    {view?.state === "dispatch_pending" ? <p>派发尚未确认，请稍后刷新或重试，系统会复用原任务。</p> : null}
    <button type="button" disabled={pending} onClick={() => void refresh()}>刷新同步状态</button>
    {view?.retryRequestId ? <button type="button" disabled={pending} onClick={() => void start()}>{pending ? "正在确认同步请求" : view.state === "not_started" ? "启动首次同步" : "重试首次同步"}</button> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
