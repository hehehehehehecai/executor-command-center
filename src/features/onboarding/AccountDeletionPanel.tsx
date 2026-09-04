"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountDeletionOperation } from "@/domain/account-deletion/account-deletion";
import { useModalFocusBoundary } from "@/shared/accessibility/use-modal-focus-boundary";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function AccountDeletionPanel({
  userId,
  fetcher = fetch,
  createIdempotencyKey = () => `account-deletion:${crypto.randomUUID()}`,
}: {
  userId: string;
  fetcher?: Fetcher;
  createIdempotencyKey?: () => string;
}) {
  const [account, setAccount] = useState<AccountDeletionOperation | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [dialog, setDialog] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetcher("/api/account-deletion", { method: "GET" })
      .then(async (response) => {
        const payload = await response.json() as { account?: AccountDeletionOperation };
        if (active && response.ok && payload.account) setAccount(payload.account);
      })
      .catch(() => { if (active) setError("账户状态暂时不可用。"); });
    return () => { active = false; };
  }, [fetcher]);

  const closeDialog = useCallback(() => {
    if (pending) return;
    setDialog(false);
    setConfirmation("");
    setRequestKey(null);
  }, [pending]);

  useModalFocusBoundary({
    active: dialog,
    dialogRef,
    initialFocusRef: confirmationRef,
    restoreFocusRef: triggerRef,
    closeBlocked: pending,
    onRequestClose: closeDialog,
  });

  const expected = `DELETE ACCOUNT ${userId}`;
  const requestDeletion = async () => {
    if (confirmation !== expected || pending) return;
    setPending(true); setError(null);
    const stableRequestKey = requestKey ?? createIdempotencyKey();
    setRequestKey(stableRequestKey);
    try {
      const response = await fetcher("/api/account-deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: stableRequestKey, confirmation }),
      });
      const payload = await response.json() as { account?: AccountDeletionOperation };
      if (!response.ok || !payload.account) throw new Error("request_failed");
      setAccount(payload.account); setDialog(false); setConfirmation(""); setRequestKey(null);
    } catch { setError("删除申请未能完成，可使用同一操作安全重试。"); }
    finally { setPending(false); }
  };
  const cancelDeletion = async () => {
    if (!account?.operationId || pending) return;
    setPending(true); setError(null);
    try {
      const response = await fetcher("/api/account-deletion", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: account.operationId }),
      });
      const payload = await response.json() as { account?: AccountDeletionOperation };
      if (!response.ok || !payload.account) throw new Error("cancel_failed");
      setAccount(payload.account);
    } catch { setError("撤销窗口已关闭或请求失败，账户继续保持冻结。"); }
    finally { setPending(false); }
  };

  const status = account?.status ?? "active";
  return (
    <section aria-labelledby="account-deletion-title">
      <p className="section-kicker">账户安全</p>
      <h2 id="account-deletion-title">账户删除</h2>
      {status === "active" ? <p>账户当前为正常状态。</p> : null}
      {status === "deletion_pending" ? (
        <div role="status">
          <p>删除申请已生效，Sync、AI 与新的数据写入已冻结。</p>
          <p>七天恢复窗口截止：<time dateTime={account?.dueAt}>{account?.dueAt}</time></p>
          <button type="button" onClick={cancelDeletion} disabled={pending}>撤销删除申请</button>
        </div>
      ) : null}
      {status === "deleting" ? <p role="status">账户正在删除，当前已不能撤销。</p> : null}
      {status === "deletion_failed" ? <p role="alert">删除暂未完成，账户仍保持冻结；有限执行重试结束后，持久恢复任务会继续安全重派。</p> : null}
      {status === "deleted" ? <p role="status">账户删除已完成。</p> : null}
      {status === "active" ? <button ref={triggerRef} type="button" onClick={() => { setDialog(true); setRequestKey(null); }}>申请删除账户</button> : null}
      {dialog ? (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="account-deletion-dialog-title" aria-describedby="account-deletion-dialog-description" tabIndex={-1}>
          <h3 id="account-deletion-dialog-title">确认申请删除账户</h3>
          <p id="account-deletion-dialog-description">申请后立即冻结 Sync 与 AI；七天内可撤销，到期后将删除业务数据与登录身份。</p>
          <p>请输入 <code>{expected}</code>。</p>
          <label htmlFor="account-deletion-confirmation">确认文本</label>
          <input ref={confirmationRef} id="account-deletion-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} />
          <button type="button" onClick={closeDialog} disabled={pending}>取消</button>
          <button type="button" onClick={requestDeletion} disabled={pending || confirmation !== expected}>确认申请删除</button>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
