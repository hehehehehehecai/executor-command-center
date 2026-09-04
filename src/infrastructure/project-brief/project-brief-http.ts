import { z } from "zod";

import type { GenerateProjectBriefInput } from "@/application/project-brief/generate-project-brief";

export const projectBriefHttpContractVersion = "project-brief-http.v1" as const;
const maximumBodyBytes = 16_384;

export const projectBriefUiMessages: Readonly<Record<string, string>> = {
  unauthenticated: "请先登录后再操作。",
  forbidden: "当前用户无权访问此项目。",
  invalid_request: "请求格式无效。",
  project_brief_generation_invalid_request: "生成请求格式无效。",
  project_brief_authorization_failed: "当前用户无权生成此项目的 Brief。",
  project_brief_freshness_failed: "项目 Freshness 暂不可用。",
  project_brief_snapshot_failed: "无法构建当前 Evidence Snapshot。",
  project_brief_cache_failed: "Brief 缓存读取失败。",
  project_brief_quota_reservation_failed: "能量点不足或预占失败。",
  project_brief_provider_failure: "AI Provider 暂不可用。",
  project_brief_empty_output: "AI Provider 未返回可用内容。",
  project_brief_parse_failure: "AI Provider 返回内容无法解析。",
  project_brief_schema_validation_failed: "生成结果未通过 Brief Schema。",
  project_brief_evidence_validation_failed: "生成结果未通过 Evidence 验证。",
  project_brief_persistence_failed: "Brief 保存失败。",
  project_brief_energy_consume_failed: "能量点确认失败。",
  project_brief_idempotency_conflict: "同一请求仍在处理或发生幂等冲突。",
  reservation_release_failed: "预占释放状态无法确认。",
  brief_not_found: "当前项目暂无已完成简报。",
  brief_expired: "当前项目的简报已过期。",
  brief_invalid: "当前项目的 Brief 结构无效。",
  follow_up_invalid_request: "追问请求格式无效。",
  follow_up_out_of_scope: "问题超出当前 Brief 与 Evidence 范围。",
  follow_up_evidence_invalid: "选择的 Evidence 不属于当前 Brief。",
  follow_up_unavailable: "受约束追问暂不可用。",
};

const generationBody = z.object({
  rangeStart: z.iso.datetime({ offset: true }),
  rangeEnd: z.iso.datetime({ offset: true }),
  requestKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/),
}).strict().refine((value) => value.rangeStart < value.rangeEnd);

const followUpBody = z.object({
  question: z.string().trim().min(1).max(500),
  evidenceReferenceIds: z.array(z.string().trim().min(1).max(1_024)).max(10),
}).strict();

function safeHeaders(responseHeaders?: Headers) {
  const headers = new Headers(responseHeaders);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  const vary = new Set(
    (headers.get("vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  );
  vary.add("Cookie");
  vary.add("Origin");
  headers.set("vary", [...vary].join(", "));
  return headers;
}

function errorCode(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    if ("code" in error && typeof error.code === "string") return error.code;
    if ("message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

function statusFor(code: string) {
  if (code === "unauthenticated") return 401;
  if (
    code === "forbidden"
    || code === "origin_forbidden"
    || code === "project_brief_authorization_failed"
  ) return 403;
  if (
    code === "invalid_request"
    || code === "project_brief_generation_invalid_request"
    || code === "follow_up_invalid_request"
  ) return 400;
  if (code === "brief_not_found") return 404;
  if (code === "brief_expired") return 410;
  if (code.includes("idempotency_conflict")) return 409;
  if (code.includes("quota_reservation")) return 402;
  if (
    code.includes("schema_validation")
    || code.includes("evidence_validation")
    || code === "follow_up_out_of_scope"
    || code === "follow_up_evidence_invalid"
  ) return 422;
  if (
    code.includes("provider")
    || code === "project_brief_empty_output"
    || code === "project_brief_parse_failure"
  ) return 502;
  return 503;
}

function failure(code: string, responseHeaders?: Headers) {
  const publicCode = Object.hasOwn(projectBriefUiMessages, code) || code === "origin_forbidden"
    ? code
    : "internal_error";
  return Response.json({
    error: {
      code: publicCode,
      message: projectBriefUiMessages[publicCode] ?? "请求暂时无法完成。",
    },
  }, { status: statusFor(publicCode), headers: safeHeaders(responseHeaders) });
}

function expectedOrigin(value: string | undefined) {
  if (!value) throw new Error("configuration");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol)
    || url.origin !== value
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) throw new Error("configuration");
  return url.origin;
}

async function parseJson(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "application/json") throw new Error("invalid_request");
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    throw new Error("invalid_request");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBodyBytes) {
        await reader.cancel("body_too_large");
        throw new Error("invalid_request");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid_request");
  }
}

function assertOrigin(request: Request, appOrigin: string | undefined) {
  let origin: string;
  try {
    origin = expectedOrigin(appOrigin);
  } catch {
    throw new Error("internal_error");
  }
  if (request.headers.get("origin") !== origin) throw new Error("origin_forbidden");
}

const uuid = z.string().uuid();

export async function handleProjectBriefGenerationRequest(input: {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly projectId: string;
  readonly responseHeaders?: Headers;
  readonly now: () => string | Promise<string>;
  readonly getVerifiedUserId: () => Promise<string | null>;
  readonly execute: (input: GenerateProjectBriefInput) => Promise<unknown>;
}) {
  try {
    assertOrigin(input.request, input.appOrigin);
    const projectId = uuid.parse(input.projectId);
    const parsed = generationBody.parse(await parseJson(input.request));
    const userId = await input.getVerifiedUserId();
    if (!userId) throw new Error("unauthenticated");
    const now = await input.now();
    const outcome = await input.execute({
      userId,
      projectId,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
      requestKey: parsed.requestKey,
      now,
    });
    return Response.json(outcome, { status: 200, headers: safeHeaders(input.responseHeaders) });
  } catch (error) {
    const code = error instanceof z.ZodError ? "invalid_request" : errorCode(error, "internal_error");
    return failure(code, input.responseHeaders);
  }
}

export async function handleProjectBriefFollowUpRequest(input: {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly projectId: string;
  readonly briefId: string;
  readonly responseHeaders?: Headers;
  readonly now: () => string | Promise<string>;
  readonly getVerifiedUserId: () => Promise<string | null>;
  readonly execute: (input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly briefId: string;
    readonly question: string;
    readonly evidenceReferenceIds: readonly string[];
    readonly now: string;
  }) => Promise<unknown>;
}) {
  try {
    assertOrigin(input.request, input.appOrigin);
    const projectId = uuid.parse(input.projectId);
    const briefId = uuid.parse(input.briefId);
    const parsed = followUpBody.parse(await parseJson(input.request));
    const userId = await input.getVerifiedUserId();
    if (!userId) throw new Error("unauthenticated");
    const outcome = await input.execute({
      actorUserId: userId,
      projectId,
      briefId,
      question: parsed.question,
      evidenceReferenceIds: [...new Set(parsed.evidenceReferenceIds)],
      now: await input.now(),
    });
    const publicOutcome = { ...(outcome as Record<string, unknown>) };
    delete publicOutcome.metadata;
    return Response.json(publicOutcome, { status: 200, headers: safeHeaders(input.responseHeaders) });
  } catch (error) {
    const code = error instanceof z.ZodError ? "invalid_request" : errorCode(error, "internal_error");
    return failure(code, input.responseHeaders);
  }
}
