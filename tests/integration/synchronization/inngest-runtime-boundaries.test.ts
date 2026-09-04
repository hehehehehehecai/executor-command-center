import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
describe("Phase 9.1.3 production runtime boundaries", () => {
  it("binds the receiving route to all three production functions", () => { const route = read("src/app/api/inngest/route.ts"); const runtime = read("src/infrastructure/jobs/inngest-runtime.ts"); expect(route).toContain("serve({ client, functions })"); expect(route).toContain("export const GET"); expect(route).toContain("export const POST"); expect(route).toContain("export const PUT"); expect(runtime).toContain("executor-project-sync-consumer"); expect(runtime).toContain("executor-github-webhook-consumer"); expect(runtime).toContain("executor-daily-reconciliation"); expect(runtime).toContain('cron("0 2 * * *")'); });
  it("references real use cases and Phase 9.1.2 delivery RPC adapter", () => { const composition = read("src/app/api/inngest/inngest-route-dependencies.ts"); for (const reference of ["ExecuteFirstRepositorySync", "ExecuteProjectSynchronization", "WebhookSynchronizationRuntime", "RunDailyRepositoryReconciliation", "SupabaseGitHubWebhookDeliveryRepository", "GitHubRestActivityReader", "SupabaseFirstSyncStore"]) expect(composition).toContain(reference); const webhook = read("src/application/synchronization/webhook-sync-use-cases.ts"); expect(webhook).toContain("claimProcessing"); expect(webhook).toContain("completeProcessing"); expect(webhook).toContain("failProcessing"); expect(webhook).not.toMatch(/from\([^)]*webhook_deliveries|\.from\(["']webhook_deliveries/); });
  it("keeps Domain and Application provider-neutral and excludes secrets/raw payload", () => { const application = [read("src/application/synchronization/project-sync-use-cases.ts"), read("src/application/synchronization/webhook-sync-use-cases.ts"), read("src/domain/jobs/background-job.ts")].join("\n"); expect(application).not.toMatch(/from ["'](?:inngest|next\/|@supabase)/); expect(application).not.toMatch(/authorizationHeader|cookieValue|privateKey|rawPayload/); });
});
