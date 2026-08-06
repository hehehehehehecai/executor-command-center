import { handleGitHubWebhookRequest } from "@/infrastructure/webhooks/github-webhook-http";
import { createGitHubWebhookIngestion } from "./webhook-route-dependencies";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const ingestion = createGitHubWebhookIngestion();
    return handleGitHubWebhookRequest(request, { execute: ingestion.execute.bind(ingestion), now: () => new Date().toISOString() });
  } catch {
    return Response.json({ result: "rejected", code: "github_webhook_configuration_missing" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
