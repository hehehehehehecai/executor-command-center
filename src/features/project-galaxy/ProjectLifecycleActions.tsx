"use client";

import { useState } from "react";

type ProjectAction = "first-sync" | "resync" | "brief";

export function ProjectLifecycleActions({ projectId }: { readonly projectId: string }) {
  const [pending, setPending] = useState<ProjectAction | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [briefRange] = useState(() => {
    const rangeEnd = new Date();
    return {
      rangeStart: new Date(rangeEnd.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      rangeEnd: rangeEnd.toISOString(),
    };
  });

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

  const requestBrief = async () => {
    if (pending) return;
    setPending("brief");
    setReceipt(null);
    setFailure(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/briefs/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rangeStart: briefRange.rangeStart,
          rangeEnd: briefRange.rangeEnd,
          requestKey: `ui-brief:${crypto.randomUUID()}`,
        }),
      });
      const payload = (await response.json()) as {
        status?: unknown;
        energyCharged?: unknown;
        briefId?: unknown;
        error?: { code?: unknown };
      };
      if (!response.ok || typeof payload.status !== "string") {
        const code = typeof payload.error?.code === "string"
          ? payload.error.code
          : "project_brief_generation_failed";
        setFailure(`Brief 生成失败：${code}`);
        return;
      }
      setReceipt(
        `${payload.status} · energy ${String(payload.energyCharged)} · ${String(payload.briefId)}`,
      );
    } catch {
      setFailure("Brief 生成失败：project_brief_generation_failed");
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
        <button
          type="button"
          onClick={() => requestSync("first-sync")}
          disabled={pending !== null}
        >
          {pending === "first-sync" ? "正在启动首次同步" : "启动首次同步"}
        </button>
        <button
          type="button"
          onClick={() => requestSync("resync")}
          disabled={pending !== null}
        >
          {pending === "resync" ? "正在请求手动重同步" : "手动重同步"}
        </button>
        <button type="button" onClick={requestBrief} disabled={pending !== null}>
          {pending === "brief" ? "正在生成 Validated Brief" : "生成 Validated Brief"}
        </button>
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
