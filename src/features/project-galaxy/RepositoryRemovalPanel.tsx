"use client";

import { useState } from "react";

import type {
  RepositoryRemovalMode,
  RepositoryRemovalResult,
} from "@/domain/repository-removal/repository-removal";

import styles from "./repository-removal.module.css";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RepositoryRemovalPanelProps {
  readonly projectId: string;
  readonly fetcher?: Fetcher;
  readonly createIdempotencyKey?: () => string;
}

type RequestFailure = {
  readonly message: string;
  readonly retryable: boolean;
};

const modePresentation = {
  REMOVE_REPOSITORY_DATA: {
    action: "移除仓库数据",
    dialogTitle: "确认移除仓库数据",
    confirmationVerb: "REMOVE",
    warning:
      "这会停止后续同步，删除仓库快照、文档派生内容和 AI 简报；项目校准与最小审计仍会保留。",
  },
  DELETE_PROJECT_SUBTREE: {
    action: "删除整个项目",
    dialogTitle: "确认删除整个项目",
    confirmationVerb: "DELETE",
    warning:
      "这会删除该项目及全部项目专属数据。账户能量账本只解除当前项目引用，不会影响其他项目。",
  },
} as const;

function isCompletedOperation(value: unknown): value is RepositoryRemovalResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.status === "completed" &&
    typeof record.operationId === "string" &&
    typeof record.projectId === "string" &&
    (record.mode === "REMOVE_REPOSITORY_DATA" ||
      record.mode === "DELETE_PROJECT_SUBTREE") &&
    typeof record.counts === "object" && record.counts !== null;
}

function responseFailure(status: number, payload: unknown): RequestFailure {
  const code =
    typeof payload === "object" && payload !== null && "error" in payload &&
    typeof payload.error === "object" && payload.error !== null &&
    "code" in payload.error && typeof payload.error.code === "string"
      ? payload.error.code
      : "repository_removal_storage_failed";

  if (code === "repository_removal_confirmation_mismatch") {
    return { message: "确认文本与当前操作不匹配，请重新确认。", retryable: false };
  }
  if (code === "repository_removal_not_found") {
    return { message: "项目不存在、已删除，或当前账户无权操作。", retryable: false };
  }
  if (code === "repository_removal_conflict") {
    return { message: "该项目已有冲突的移除操作，请稍后刷新状态。", retryable: true };
  }
  if (code === "repository_removal_precondition_failed") {
    return { message: "当前项目状态不满足移除前置条件。", retryable: false };
  }
  if (code === "repository_removal_retryable_job_conflict") {
    return { message: "后台任务尚未安全关闭，可以安全重试。", retryable: true };
  }
  return {
    message: status >= 500
      ? "移除事务未能完成，可以安全重试。"
      : "请求未能完成，请检查确认内容。",
    retryable: status >= 500,
  };
}

export function RepositoryRemovalPanel({
  projectId,
  fetcher = fetch,
  createIdempotencyKey = () => `repository-removal:${crypto.randomUUID()}`,
}: RepositoryRemovalPanelProps) {
  const [mode, setMode] = useState<RepositoryRemovalMode | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<"confirming" | "pending" | "failed" | "completed" | null>(null);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [result, setResult] = useState<RepositoryRemovalResult | null>(null);

  const openConfirmation = (nextMode: RepositoryRemovalMode) => {
    setMode(nextMode);
    setConfirmation("");
    setRequestKey(null);
    setFailure(null);
    setResult(null);
    setPhase("confirming");
  };

  const cancel = () => {
    if (phase === "pending") return;
    setMode(null);
    setConfirmation("");
    setRequestKey(null);
    setFailure(null);
    setPhase(null);
  };

  const submit = async () => {
    if (!mode || phase === "pending") return;
    const presentation = modePresentation[mode];
    const expected = `${presentation.confirmationVerb} ${projectId}`;
    if (confirmation !== expected) return;

    const stableRequestKey = requestKey ?? createIdempotencyKey();
    setRequestKey(stableRequestKey);
    setFailure(null);
    setPhase("pending");
    try {
      const response = await fetcher(
        `/api/projects/${projectId}/repository-removal`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId,
            mode,
            idempotencyKey: stableRequestKey,
            confirmation: { projectId, text: confirmation },
          }),
        },
      );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        setFailure(responseFailure(response.status, payload));
        setPhase("failed");
        return;
      }
      const operation =
        typeof payload === "object" && payload !== null && "operation" in payload
          ? payload.operation
          : null;
      if (!isCompletedOperation(operation) || operation.projectId !== projectId || operation.mode !== mode) {
        setFailure({ message: "服务器返回了无法验证的结果，可以安全重试。", retryable: true });
        setPhase("failed");
        return;
      }
      setResult(operation);
      setPhase("completed");
    } catch {
      setFailure({ message: "网络请求未完成，可以安全重试。", retryable: true });
      setPhase("failed");
    }
  };

  const presentation = mode ? modePresentation[mode] : null;
  const expectedConfirmation = mode && presentation
    ? `${presentation.confirmationVerb} ${projectId}`
    : "";

  return (
    <section className={styles.panel} aria-labelledby="repository-removal-title">
      <div className={styles.heading}>
        <p className={styles.kicker}>仓库与项目管理</p>
        <h2 id="repository-removal-title">数据移除</h2>
        <p>
          两种操作范围不同。都不会撤销 GitHub App，也不会删除账户。
        </p>
      </div>

      <div className={styles.options}>
        <article className={styles.option}>
          <h3>仅移除仓库派生数据</h3>
          <p>停止同步并清除仓库、文档与 AI 派生内容，保留项目校准和最小审计。</p>
          <button
            type="button"
            className={styles.secondaryDanger}
            onClick={() => openConfirmation("REMOVE_REPOSITORY_DATA")}
            disabled={phase === "pending"}
          >
            移除仓库数据
          </button>
        </article>
        <article className={styles.option}>
          <h3>删除项目子树</h3>
          <p>删除项目及项目专属记录；不会删除其他项目、账户额度或共享配置。</p>
          <button
            type="button"
            className={styles.primaryDanger}
            onClick={() => openConfirmation("DELETE_PROJECT_SUBTREE")}
            disabled={phase === "pending"}
          >
            删除整个项目
          </button>
        </article>
      </div>

      {mode && presentation && phase !== "completed" ? (
        <section
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="repository-removal-dialog-title"
        >
          <h3 id="repository-removal-dialog-title">{presentation.dialogTitle}</h3>
          <p>{presentation.warning}</p>
          <p>
            请输入 <code>{expectedConfirmation}</code> 继续。
          </p>
          <label htmlFor="repository-removal-confirmation">确认文本</label>
          <input
            id="repository-removal-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={phase === "pending"}
          />
          {failure ? (
            <p className={styles.failure} role="alert">{failure.message}</p>
          ) : null}
          <div className={styles.dialogActions}>
            <button type="button" onClick={cancel} disabled={phase === "pending"}>
              取消
            </button>
            {phase === "failed" && failure?.retryable ? (
              <button type="button" className={styles.primaryDanger} onClick={submit}>
                重试
              </button>
            ) : (
              <button
                type="button"
                className={styles.primaryDanger}
                onClick={submit}
                disabled={confirmation !== expectedConfirmation || phase === "pending"}
              >
                {phase === "pending" ? "处理中" : presentation.dialogTitle}
              </button>
            )}
          </div>
        </section>
      ) : null}

      {phase === "completed" && result ? (
        <div className={styles.success} role="status">
          <h3>
            {result.mode === "REMOVE_REPOSITORY_DATA"
              ? "仓库数据已移除"
              : "项目已删除"}
          </h3>
          {result.mode === "REMOVE_REPOSITORY_DATA" ? (
            <p>
              保留记录仍可查看；{result.counts.invalidated.evidence_links ?? 0} 条
              Evidence Link 已标记为 SOURCE_REMOVED，不再作为有效证据展示。
            </p>
          ) : (
            <p>项目子树已删除，其他项目与账户级数据未纳入本次操作。</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
