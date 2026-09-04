import type { ManualRepositoryResync } from "@/application/synchronization/reconciliation-use-cases";

export const manualResyncHttpContract = "manual-resync-http.v1" as const;

const requestId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const statuses = {
  accepted: 202,
  coalesced: 200,
  duplicate: 200,
  forbidden: 403,
  authorization_revoked: 409,
  suspended: 409,
  not_found: 404,
  failed: 503,
  rejected: 400,
} as const;

function copyHeadersPreservingCookies(source: Headers | undefined, target: Headers) {
  if (!source) return;
  source.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") target.set(name, value);
  });
  for (const cookie of source.getSetCookie()) target.append("set-cookie", cookie);
}

function secureMutationHeaders(source?: Headers): Headers {
  const headers = new Headers();
  copyHeadersPreservingCookies(source, headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  const vary = (headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set(vary.map((value) => value.toLowerCase()));
  if (!seen.has("cookie")) vary.push("Cookie");
  if (!seen.has("origin")) vary.push("Origin");
  headers.set("vary", vary.join(", "));
  return headers;
}

function response(
  body: { readonly result: string; readonly code: string; readonly syncRunId: string | null },
  status: number,
  responseHeaders?: Headers,
): Response {
  return Response.json(body, { status, headers: secureMutationHeaders(responseHeaders) });
}

function canonicalAppOrigin(value: string | undefined): string {
  try {
    if (!value) throw new Error("missing");
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username !== "" || parsed.password !== ""
      || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== ""
      || parsed.origin === "null" || value !== parsed.origin
      || (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")
    ) {
      throw new Error("invalid");
    }
    return parsed.origin;
  } catch (error) {
    throw new Error("manual_resync_configuration_missing", { cause: error });
  }
}

export async function handleManualResyncRequest(input: {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly projectId: string;
  readonly requestedAt: string | (() => Promise<string>);
  readonly execute: ManualRepositoryResync["execute"];
  readonly responseHeaders?: Headers;
}): Promise<Response> {
  let allowedOrigin: string;
  try {
    allowedOrigin = canonicalAppOrigin(input.appOrigin);
  } catch {
    return response(
      { result: "failed", code: "manual_resync_configuration_missing", syncRunId: null },
      503,
      input.responseHeaders,
    );
  }
  if (input.request.headers.get("origin") !== allowedOrigin) {
    return response(
      { result: "rejected", code: "manual_resync_origin_forbidden", syncRunId: null },
      403,
      input.responseHeaders,
    );
  }
  const contentType = input.request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return response(
      { result: "rejected", code: "manual_resync_invalid_request", syncRunId: null },
      400,
      input.responseHeaders,
    );
  }
  let body: unknown;
  try {
    body = await input.request.json();
  } catch {
    return response(
      { result: "rejected", code: "manual_resync_invalid_request", syncRunId: null },
      400,
      input.responseHeaders,
    );
  }
  if (
    typeof body !== "object" || body === null || Array.isArray(body)
    || Object.keys(body).length !== 1 || !("requestId" in body)
    || typeof body.requestId !== "string" || !requestId.test(body.requestId)
  ) {
    return response(
      { result: "rejected", code: "manual_resync_invalid_request", syncRunId: null },
      400,
      input.responseHeaders,
    );
  }
  try {
    const requestedAt = typeof input.requestedAt === "string"
      ? input.requestedAt
      : await input.requestedAt();
    const result = await input.execute({
      projectId: input.projectId,
      requestId: body.requestId,
      requestedAt,
    });
    return response({
      result: result.result,
      code: result.code,
      syncRunId: result.syncRunId,
    }, statuses[result.result], input.responseHeaders);
  } catch {
    return response(
      { result: "failed", code: "manual_resync_failed", syncRunId: null },
      503,
      input.responseHeaders,
    );
  }
}
