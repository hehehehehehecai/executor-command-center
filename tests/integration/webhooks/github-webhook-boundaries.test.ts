import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";
import { IngestGitHubWebhook } from "@/application/webhooks/ingest-github-webhook";
import { SupabaseGitHubWebhookDeliveryRepository } from "@/infrastructure/webhooks/supabase-github-webhook-delivery-repository";
describe("Phase 6 provider boundaries", () => {
  it("keeps Domain/Application free of Next, Supabase and Inngest imports", async () => {
    const results = await new ESLint({ cwd: process.cwd() }).lintFiles(["src/domain/webhooks/**/*.ts", "src/application/webhooks/**/*.ts"]);
    expect(results.flatMap((result) => result.messages)).toEqual([]);
  }, 120_000);

  it("keeps unsupported installation ignored through Application and Supabase adapter", async () => {
    const deliveryId = "77777777-7777-4777-8777-777777777777";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ outcome: "new", status: "ignored", version: 1, project_id: null }), { status: 200, headers: { "content-type": "application/json" } }));
    const dispatcher = { dispatch: vi.fn(async () => ({ providerReceiptId: "must-not-be-used" })) };
    const useCase = new IngestGitHubWebhook({
      cryptography: { verify: vi.fn(() => ({ valid: true, bodySha256: "f".repeat(64) })) },
      repository: new SupabaseGitHubWebhookDeliveryRepository({ supabaseUrl: "https://synthetic.invalid", serviceRoleKey: "synthetic-service-role", fetcher }),
      dispatcher,
    });

    await expect(useCase.execute({
      body: new TextEncoder().encode(JSON.stringify({ action: "created", installation: { id: 81_001 } })),
      signature: `sha256=${"a".repeat(64)}`,
      deliveryId,
      eventName: "installation",
      receivedAt: "2026-08-06T04:30:00.000Z",
    })).resolves.toEqual({ result: "ignored", code: "github_webhook_ignored", httpStatus: 200 });

    const registerBody = JSON.parse(String(fetcher.mock.calls[0]![1]!.body)) as Record<string, unknown>;
    expect(registerBody).toMatchObject({ p_delivery_id: deliveryId, p_event_name: "installation", p_action: "created", p_supported: false, p_installation_id: 81_001, p_repository_id: null, p_repository_full_name: null });
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
