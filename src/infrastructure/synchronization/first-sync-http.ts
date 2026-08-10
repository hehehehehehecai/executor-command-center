import type { FirstSyncStarter } from "@/application/synchronization/first-sync-production-entry";

export const firstSyncHttpContract = "first-sync-http.v1" as const;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type FirstSyncSafeFailure = {
  readonly contractVersion: typeof firstSyncHttpContract;
  readonly failureId: string;
  readonly phase: "first_sync_start";
  readonly failureCode: string;
  readonly status: number;
};

function copyHeadersPreservingCookies(source: Headers | undefined, target: Headers) {
  if (!source) return;
  source.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") target.set(name, value);
  });
  for (const cookie of source.getSetCookie()) target.append("set-cookie", cookie);
}

function secureHeaders(source?: Headers) {
  const headers = new Headers();
  copyHeadersPreservingCookies(source, headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  const values = (headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set(values.map((value) => value.toLowerCase()));
  if (!seen.has("cookie")) values.push("Cookie");
  if (!seen.has("origin")) values.push("Origin");
  headers.set("vary", values.join(", "));
  return headers;
}

function json(body: unknown, status: number, source?: Headers) {
  return Response.json(body, { status, headers: secureHeaders(source) });
}

function canonicalOrigin(value: string | undefined) {
  try {
    if (!value) throw new Error("missing");
    const parsed = new URL(value);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (
      (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local))
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.origin !== value
    ) {
      throw new Error("invalid");
    }
    return parsed.origin;
  } catch (error) {
    throw new Error("first_sync_configuration_missing", { cause: error });
  }
}

function publicFailure(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  switch (candidate) {
    case "first_sync_invalid_request":
      return { code: candidate, status: 400 };
    case "first_sync_unauthenticated":
      return { code: candidate, status: 401 };
    case "first_sync_project_not_found":
      return { code: candidate, status: 404 };
    case "first_sync_authorization_revoked":
      return { code: candidate, status: 409 };
    case "first_sync_configuration_missing":
      return { code: candidate, status: 503 };
    default:
      return { code: "first_sync_start_failed", status: 503 };
  }
}

function failureResponse(input: {
  readonly error: unknown;
  readonly responseHeaders?: Headers;
  readonly onFailure?: (failure: FirstSyncSafeFailure) => void;
}) {
  const failure = publicFailure(input.error);
  input.onFailure?.({
    contractVersion: firstSyncHttpContract,
    failureId: crypto.randomUUID(),
    phase: "first_sync_start",
    failureCode: failure.code,
    status: failure.status,
  });
  return json(
    { result: "failed", code: failure.code, syncRunId: null, jobId: null },
    failure.status,
    input.responseHeaders,
  );
}

export async function handleFirstSyncRequest(input: {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly projectId: string;
  readonly execute: FirstSyncStarter["execute"];
  readonly responseHeaders?: Headers;
  readonly onFailure?: (failure: FirstSyncSafeFailure) => void;
}) {
  let origin: string;
  try {
    origin = canonicalOrigin(input.appOrigin);
  } catch (error) {
    return failureResponse({ ...input, error });
  }
  if (input.request.headers.get("origin") !== origin) {
    return json(
      { result: "rejected", code: "first_sync_origin_forbidden", syncRunId: null, jobId: null },
      403,
      input.responseHeaders,
    );
  }
  const contentType = input.request.headers.get("content-type")
    ?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json" || !uuid.test(input.projectId)) {
    return json(
      { result: "rejected", code: "first_sync_invalid_request", syncRunId: null, jobId: null },
      400,
      input.responseHeaders,
    );
  }
  let body: unknown;
  try {
    body = await input.request.json();
  } catch {
    return json(
      { result: "rejected", code: "first_sync_invalid_request", syncRunId: null, jobId: null },
      400,
      input.responseHeaders,
    );
  }
  if (
    typeof body !== "object" || body === null || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !("requestId" in body)
    || typeof body.requestId !== "string"
    || !requestId.test(body.requestId)
  ) {
    return json(
      { result: "rejected", code: "first_sync_invalid_request", syncRunId: null, jobId: null },
      400,
      input.responseHeaders,
    );
  }
  try {
    const receipt = await input.execute({ projectId: input.projectId, requestId: body.requestId });
    return json({
      result: receipt.reused ? "duplicate" : "accepted",
      code: receipt.reused ? "first_sync_reused" : "first_sync_accepted",
      syncRunId: receipt.syncRunId,
      jobId: receipt.jobId,
    }, receipt.reused ? 200 : 202, input.responseHeaders);
  } catch (error) {
    return failureResponse({ ...input, error });
  }
}
