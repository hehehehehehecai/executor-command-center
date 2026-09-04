import type { IngestGitHubWebhook } from "@/application/webhooks/ingest-github-webhook";
import { githubWebhookMaxBodyBytes } from "@/application/webhooks/ingest-github-webhook";

function response(body: { result: "rejected"; code: string }, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength)) throw new Error("invalid");
    if (Number(contentLength) > githubWebhookMaxBodyBytes) throw new Error("too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > githubWebhookMaxBodyBytes) {
        await reader.cancel("body_too_large");
        throw new Error("too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (contentLength !== null && Number(contentLength) !== size) throw new Error("invalid");
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleGitHubWebhookRequest(request: Request, dependencies: { execute: IngestGitHubWebhook["execute"]; now: () => string }) {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return response({ result: "rejected", code: "github_webhook_request_invalid" }, 400);
  let body: Uint8Array;
  try {
    body = await readBoundedBody(request);
  } catch (error) {
    return error instanceof Error && error.message === "too_large"
      ? response({ result: "rejected", code: "github_webhook_body_too_large" }, 413)
      : response({ result: "rejected", code: "github_webhook_request_invalid" }, 400);
  }
  const result = await dependencies.execute({ body, signature: request.headers.get("x-hub-signature-256") ?? "", deliveryId: request.headers.get("x-github-delivery") ?? "", eventName: request.headers.get("x-github-event") ?? "", receivedAt: dependencies.now() });
  return Response.json({ result: result.result, code: result.code }, { status: result.httpStatus, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
