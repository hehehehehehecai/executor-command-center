import type { IngestGitHubWebhook } from "@/application/webhooks/ingest-github-webhook";
export async function handleGitHubWebhookRequest(request: Request, dependencies: { execute: IngestGitHubWebhook["execute"]; now: () => string }) {
  let body: Uint8Array; try { body = new Uint8Array(await request.arrayBuffer()); } catch { return Response.json({ result: "rejected", code: "github_webhook_request_invalid" }, { status: 400 }); }
  const result = await dependencies.execute({ body, signature: request.headers.get("x-hub-signature-256") ?? "", deliveryId: request.headers.get("x-github-delivery") ?? "", eventName: request.headers.get("x-github-event") ?? "", receivedAt: dependencies.now() });
  return Response.json({ result: result.result, code: result.code }, { status: result.httpStatus, headers: { "cache-control": "no-store" } });
}
