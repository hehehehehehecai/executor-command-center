import type { ManualRepositoryResync } from "@/application/synchronization/reconciliation-use-cases";

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

export async function handleManualResyncRequest(input: {
  readonly request: Request;
  readonly projectId: string;
  readonly requestedAt: string | (() => Promise<string>);
  readonly execute: ManualRepositoryResync["execute"];
}): Promise<Response> {
  let body: unknown;
  try {
    body = await input.request.json();
  } catch {
    return Response.json({ result: "rejected", code: "manual_resync_invalid_request", syncRunId: null }, { status: 400 });
  }
  if (
    typeof body !== "object" || body === null || Array.isArray(body)
    || Object.keys(body).length !== 1 || !("requestId" in body)
    || typeof body.requestId !== "string" || !requestId.test(body.requestId)
  ) {
    return Response.json({ result: "rejected", code: "manual_resync_invalid_request", syncRunId: null }, { status: 400 });
  }
  const requestedAt = typeof input.requestedAt === "string"
    ? input.requestedAt
    : await input.requestedAt();
  const result = await input.execute({
    projectId: input.projectId,
    requestId: body.requestId,
    requestedAt,
  });
  return Response.json({
    result: result.result,
    code: result.code,
    syncRunId: result.syncRunId,
  }, { status: statuses[result.result] });
}
