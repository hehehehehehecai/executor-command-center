"use client";

import { useEffect, useRef, useState } from "react";
import { workspaceHref, workspaceProjectIdPattern } from "@/shared/workspace-navigation";
import { projectBriefUiMessages } from "@/infrastructure/project-brief/project-brief-http";
import { FirstSyncStatusPanel } from "./FirstSyncStatusPanel";

type ProjectAction = "resync" | "brief";

type BriefIntent = { projectId: string; rangeStart: string; rangeEnd: string; requestKey: string };
const intentStorageKey = (projectId: string) => `project-brief-intent:${projectId}`;

function storedIntent(projectId: string): BriefIntent | null {
  const raw = sessionStorage.getItem(intentStorageKey(projectId));
  if (!raw) return null;
  const value: BriefIntent = JSON.parse(raw);
  if (value.projectId !== projectId || typeof value.requestKey !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/.test(value.requestKey)
    || typeof value.rangeStart !== "string" || typeof value.rangeEnd !== "string"
    || !Number.isFinite(Date.parse(value.rangeStart)) || !Number.isFinite(Date.parse(value.rangeEnd))
    || value.rangeStart >= value.rangeEnd) throw new Error("invalid_stored_intent");
  return value;
}

export function ProjectBriefGenerationAction({ projectId, availableEnergy, verifiedRange }: {
  readonly projectId: string;
  readonly availableEnergy?: number | null;
  readonly verifiedRange?: { readonly rangeStart: string; readonly rangeEnd: string };
}) {
  const [range, setRange] = useState({ rangeStart: "", rangeEnd: "" });
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const failedRequestKey = useRef<string | null>(null);
  useEffect(() => {
    const current = ++generation.current;
    failedRequestKey.current = null;
    queueMicrotask(() => {
      if (generation.current !== current) return;
      try {
        const saved = storedIntent(projectId);
        const end = new Date();
        setRange(saved ?? { rangeStart: new Date(end.getTime() - 7 * 86400000).toISOString(), rangeEnd: end.toISOString() });
        setMessage(saved ? "已恢复本次生成请求；重试会先查询缓存或等待原持久结果。" : null);
      } catch {
        setFailure("无法恢复本次请求，请允许会话存储后重试；不会建立新请求重复收费。");
      }
      setLoaded(true);
    });
    return () => { generation.current = current + 1; };
  }, [projectId]);

  const requestBrief = async () => {
    if (busy.current || !loaded) return;
    busy.current = true;
    const current = generation.current;
    setPending(true); setFailure(null); setMessage(null);
    try {
      if (!workspaceProjectIdPattern.test(projectId) || !range.rangeStart || range.rangeStart >= range.rangeEnd) throw new Error("invalid_request");
      const saved = storedIntent(projectId);
      const intent = saved && saved.rangeStart === range.rangeStart && saved.rangeEnd === range.rangeEnd && saved.requestKey !== failedRequestKey.current
        ? saved : { projectId, ...range, requestKey: `ui-brief:${crypto.randomUUID()}` };
      sessionStorage.setItem(intentStorageKey(projectId), JSON.stringify(intent));
      failedRequestKey.current = null;
      if (saved && verifiedRange?.rangeStart === intent.rangeStart && verifiedRange.rangeEnd === intent.rangeEnd) {
        setMessage("本次范围已有已验证简报，可直接阅读；未再次生成或收费。");
        return;
      }
      const response = await fetch(`/api/projects/${projectId}/briefs/generate`, {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rangeStart: intent.rangeStart, rangeEnd: intent.rangeEnd, requestKey: intent.requestKey }),
      });
      const payload = await response.json() as { status?: unknown; briefId?: unknown; energyCharged?: unknown; brief?: { projectId?: unknown; rangeStart?: unknown; rangeEnd?: unknown }; error?: { code?: unknown } };
      if (generation.current !== current) return;
      if (!response.ok) {
        const code = typeof payload.error?.code === "string" ? payload.error.code : "internal_error";
        // This code is returned only after the durable failure and refund succeed.
        // A lost response or uncertain refund must keep the original request key.
        if (code === "project_brief_provider_failure" || code === "project_brief_schema_validation_failed") failedRequestKey.current = intent.requestKey;
        setFailure(projectBriefUiMessages[code] ?? "生成未完成，请保留本次范围并重试原请求。");
        return;
      }
      if (!['generated', 'cache_hit'].includes(String(payload.status)) || typeof payload.briefId !== "string"
        || !workspaceProjectIdPattern.test(payload.briefId) || payload.brief?.projectId !== projectId
        || payload.brief.rangeStart !== intent.rangeStart || payload.brief.rangeEnd !== intent.rangeEnd
        || typeof payload.energyCharged !== "number" || ![0, 3].includes(payload.energyCharged)) throw new Error("invalid_generation_result");
      setMessage(payload.status === "cache_hit" ? "已读取已完成简报，缓存命中未额外收费。" : "简报已保存，正在打开已验证正文。");
      window.location.assign(workspaceHref("copilot", { projectId, mode: "connected", query: { briefId: payload.briefId } }));
    } catch {
      if (generation.current === current) setFailure("本次结果尚未确认。已保存的请求键和范围会保留；重试原请求不会主动建立新计费请求。");
    } finally {
      busy.current = false;
      if (generation.current === current) setPending(false);
    }
  };

  return <section aria-label="生成项目简报">
    <p>请先完成仓库同步。生成一次消耗 3 能量点，缓存命中不额外收费。</p>
    <p>{availableEnergy === undefined || availableEnergy === null ? "当前配额尚未读取，生成时由服务端核对。" : `当前可用能量：${availableEnergy}；首次生成时按原合同领取每日额度。`}</p>
    <details><summary>选择简报时间范围</summary>
      <label>开始时间（UTC）<input type="datetime-local" disabled={pending || !loaded} value={range.rangeStart.slice(0, 16)} onChange={e => { if (e.target.value) { setRange({ ...range, rangeStart: new Date(`${e.target.value}Z`).toISOString() }); setMessage(null); } }} /></label>
      <label>结束时间（UTC）<input type="datetime-local" disabled={pending || !loaded} value={range.rangeEnd.slice(0, 16)} onChange={e => { if (e.target.value) { setRange({ ...range, rangeEnd: new Date(`${e.target.value}Z`).toISOString() }); setMessage(null); } }} /></label>
    </details>
    <button type="button" disabled={pending || !loaded || !range.rangeStart} onClick={requestBrief}>{pending ? "正在生成项目简报" : "生成项目简报"}</button>
    {message ? <p role="status" aria-label="简报生成结果">{message}</p> : null}
    {failure ? <p role="alert">{failure}</p> : null}
  </section>;
}

export function ProjectLifecycleActions({ projectId }: { readonly projectId: string }) {
  const [pending, setPending] = useState<ProjectAction | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const requestSync = async (action: Exclude<ProjectAction, "brief">) => {
    if (pending) return;
    setPending(action);
    setReceipt(null);
    setFailure(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: `ui-${crypto.randomUUID()}` }),
      });
      const payload = (await response.json()) as {
        code?: unknown;
        syncRunId?: unknown;
      };
      if (!response.ok || typeof payload.code !== "string") {
        throw new Error("sync_request_failed");
      }
      setReceipt(
        `${payload.code}${typeof payload.syncRunId === "string" ? ` · ${payload.syncRunId}` : ""}`,
      );
    } catch {
      setFailure("同步请求未能完成，可安全重试。");
    } finally {
      setPending(null);
    }
  };


  return (
    <section aria-labelledby="project-lifecycle-actions-title">
      <p className="section-kicker">项目操作</p>
      <h2 id="project-lifecycle-actions-title">同步生命周期</h2>
      <p>操作使用当前登录身份、项目所有权与幂等合同。</p>
      <div>
        <FirstSyncStatusPanel projectId={projectId} />
        <button
          type="button"
          onClick={() => requestSync("resync")}
          disabled={pending !== null}
        >
          {pending === "resync" ? "正在请求手动重同步" : "手动重同步"}
        </button>
        <ProjectBriefGenerationAction key={projectId} projectId={projectId} />
      </div>
      {receipt ? (
        <p
          role="status"
          aria-label={receipt.includes("energy") ? "Brief 生成结果" : "同步操作结果"}
        >
          {receipt}
        </p>
      ) : null}
      {failure ? <p role="alert">{failure}</p> : null}
    </section>
  );
}
