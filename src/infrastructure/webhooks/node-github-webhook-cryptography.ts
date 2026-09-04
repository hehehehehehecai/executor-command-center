import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { GitHubWebhookCryptography } from "@/application/webhooks/ingest-github-webhook";

export class NodeGitHubWebhookCryptography implements GitHubWebhookCryptography {
  constructor(private readonly secret: string) { if (!secret) throw new Error("github_webhook_configuration_missing"); }
  verify(input: { body: Uint8Array; signature: string }) {
    const bodySha256 = createHash("sha256").update(input.body).digest("hex");
    if (!/^sha256=[0-9a-f]{64}$/.test(input.signature)) return { valid: false, bodySha256 };
    const expected = createHmac("sha256", this.secret).update(input.body).digest();
    const supplied = Buffer.from(input.signature.slice(7), "hex");
    return { valid: supplied.length === expected.length && timingSafeEqual(supplied, expected), bodySha256 };
  }
}
