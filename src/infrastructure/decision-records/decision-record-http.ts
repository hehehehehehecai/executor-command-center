import { parseDecisionProjectId, parseManualDecisionCommand, type ManualDecisionCommand, type PersistedDecisionRecord } from "@/application/decision-records/decision-record-input";
import { trustedWorkspaceMutation, workspaceHeaders } from "@/infrastructure/workspace/workspace-http";

const errors = {
  decision_record_method_not_allowed: { status: 405, message: "请使用明确的保存操作。" },
  decision_record_disabled: { status: 404, message: "决策保存尚未启用，已有记录仍可读取。" },
  decision_record_origin_forbidden: { status: 403, message: "请从当前网站保存决策。" },
  decision_record_invalid_request: { status: 400, message: "请完整填写决定和确认原因，并检查引用。" },
  decision_record_unauthenticated: { status: 401, message: "请先登录，再保存决策。" },
  decision_record_forbidden: { status: 403, message: "当前项目不可写入，请检查项目归属和授权状态。" },
  decision_record_conflict: { status: 409, message: "该提交已保存，但内容不同。请刷新记录后重新填写。" },
  decision_record_unavailable: { status: 503, message: "决策暂时无法保存，内容尚未确认保存成功。" },
} as const;

export async function handleDecisionRecordWrite(input: {
  readonly request: Request; readonly projectId: unknown; readonly flag: unknown;
  readonly appOrigin?: string; readonly responseHeaders?: Headers;
  readonly execute: (projectId: string, command: ManualDecisionCommand) => Promise<PersistedDecisionRecord>;
}): Promise<Response> {
  try {
    if (input.request.method !== "POST") throw new Error("decision_record_method_not_allowed");
    if (input.flag !== "1") throw new Error("decision_record_disabled");
    if (!trustedWorkspaceMutation(input.request, input.appOrigin)) throw new Error("decision_record_origin_forbidden");
    if (new URL(input.request.url).search || input.request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new Error("decision_record_invalid_request");
    }
    let body: unknown;
    try { body = await input.request.json(); } catch { throw new Error("decision_record_invalid_request"); }
    const projectId = parseDecisionProjectId(input.projectId);
    const command = parseManualDecisionCommand(body);
    return Response.json({ record: await input.execute(projectId, command) }, { headers: workspaceHeaders(input.responseHeaders) });
  } catch (error) {
    const candidate = error instanceof Error ? error.message : "";
    const code = Object.hasOwn(errors, candidate) ? candidate as keyof typeof errors : "decision_record_unavailable";
    const headers = workspaceHeaders(input.responseHeaders);
    if (errors[code].status === 405) headers.set("allow", "POST");
    return Response.json({ error: { code, message: errors[code].message } }, { status: errors[code].status, headers });
  }
}
