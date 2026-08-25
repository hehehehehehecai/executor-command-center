import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createInngestRouteDependencies, inngestRouteCompositionContract } from "./inngest-route-dependencies";
const valid = { NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role", GITHUB_APP_ID: "123456", GITHUB_APP_SLUG: "synthetic-app", GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nsynthetic-not-used\n-----END PRIVATE KEY-----", GITHUB_REST_API_VERSION: "2026-03-10", GITHUB_WEBHOOK_SECRET: "synthetic-webhook-secret", INNGEST_EVENT_KEY: "synthetic-event-key", INNGEST_SIGNING_KEY: "signkey-test-synthetic", APP_ORIGIN: "https://synthetic.example.test" };
describe("inngest-route-composition.v1", () => {
  it("fails closed when signing or event key is absent", () => { expect(() => createInngestRouteDependencies({ ...valid, INNGEST_SIGNING_KEY: undefined })).toThrow(); expect(() => createInngestRouteDependencies({ ...valid, INNGEST_EVENT_KEY: undefined })).toThrow(); });
  it("composes one client and four real functions without network at construction", () => { const fetchSpy = vi.spyOn(globalThis, "fetch"); const result = createInngestRouteDependencies(valid); expect(inngestRouteCompositionContract).toBe("inngest-route-composition.v1"); expect(result.functions).toHaveLength(4); expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore(); });
});
