"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DecisionReferenceKind } from "./decision-archive-view-model";
import styles from "./decision-archive.module.css";

export function ManualDecisionSaveForm({ projectId }: { readonly projectId: string }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    key.current ??= crypto.randomUUID();
    const referenceUrl = String(fields.get("referenceUrl") ?? "").trim();
    submitting.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decisions`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: key.current, decision: fields.get("decision"), confirmationReason: fields.get("reason"),
          alternatives: String(fields.get("alternatives") ?? "").split(/\r?\n/),
          revisitCondition: String(fields.get("revisitCondition") ?? "") || null,
          references: referenceUrl ? [{ id: `${key.current}:reference`, kind: String(fields.get("referenceKind")) as DecisionReferenceKind, label: String(fields.get("referenceLabel") ?? "").trim() || referenceUrl, originalUrl: referenceUrl }] : [],
        }),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error?.message ?? "决策暂时无法保存，请保留填写内容后重试。"); return; }
      key.current = null; form.reset(); setMessage("决策已保存。刷新、换页或重新登录后可再次读取。");
      router.refresh();
    } catch { setMessage("未收到保存结果，请保留填写内容后重试；重复提交不会重复创建记录。"); }
    finally { submitting.current = false; setPending(false); }
  }

  return <form className={styles.manualForm} aria-label="手动创建决策记录" onSubmit={save} onChange={() => { if (!submitting.current) key.current = null; }}>
    <label><span>决定内容</span><textarea name="decision" rows={3} required disabled={pending} aria-label="决定内容" /></label>
    <label><span>确认原因</span><textarea name="reason" rows={3} required disabled={pending} aria-label="确认原因" /></label>
    <label><span>替代方案（每行一项）</span><textarea name="alternatives" rows={3} disabled={pending} /></label>
    <label><span>重新审视条件（可选）</span><input name="revisitCondition" disabled={pending} /></label>
    <label><span>引用类型</span><select name="referenceKind" defaultValue="document" disabled={pending}><option value="document">文档</option><option value="commit">提交</option><option value="pull_request">合并请求</option><option value="issue">问题</option></select></label>
    <label><span>引用名称（可选）</span><input name="referenceLabel" disabled={pending} /></label>
    <label><span>引用链接（可选，HTTPS）</span><input name="referenceUrl" type="url" pattern="https://.*" disabled={pending} /></label>
    <button type="submit" disabled={pending}>{pending ? "正在保存…" : "保存决策记录"}</button>
    <small>仅保存到当前本人项目；确认者和确认时间由服务端记录。</small>
    {message ? <p role="status" className={styles.feedback}>{message}</p> : null}
  </form>;
}
