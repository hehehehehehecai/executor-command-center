import "server-only";
import { Inngest } from "inngest";
import { IngestGitHubWebhook } from "@/application/webhooks/ingest-github-webhook";
import { InngestGitHubWebhookDispatcher } from "@/infrastructure/webhooks/inngest-github-webhook-dispatcher";
import { NodeGitHubWebhookCryptography } from "@/infrastructure/webhooks/node-github-webhook-cryptography";
import { SupabaseGitHubWebhookDeliveryRepository } from "@/infrastructure/webhooks/supabase-github-webhook-delivery-repository";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export function createGitHubWebhookIngestion() {
  const environment = parseServerEnvironment(process.env);
  if (!environment.GITHUB_WEBHOOK_SECRET || !environment.NEXT_PUBLIC_SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY || !environment.INNGEST_EVENT_KEY) throw new Error("github_webhook_configuration_missing");
  return new IngestGitHubWebhook({
    cryptography: new NodeGitHubWebhookCryptography(environment.GITHUB_WEBHOOK_SECRET),
    repository: new SupabaseGitHubWebhookDeliveryRepository({ supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }),
    dispatcher: new InngestGitHubWebhookDispatcher(new Inngest({ id: "executor-command-center-webhook", eventKey: environment.INNGEST_EVENT_KEY })),
  });
}
