import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}));

import {
  createFirstSyncRouteDependencies,
  firstSyncRouteCompositionContract,
} from "./first-sync-route-dependencies";

const environment = {
  APP_ORIGIN: "https://executor.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
  INNGEST_EVENT_KEY: "synthetic-event-key",
  INNGEST_SIGNING_KEY: "signkey-test-synthetic",
} as const;

describe("first-sync-route-composition.v1", () => {
  it("fails closed when any required session, service or dispatch configuration is absent", async () => {
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "INNGEST_EVENT_KEY",
      "APP_ORIGIN",
    ] as const) {
      await expect(createFirstSyncRouteDependencies(new Headers(), {
        ...environment,
        [key]: undefined,
      })).rejects.toThrow("first_sync_configuration_missing");
    }
  });

  it("constructs the real authenticated start composition without remote calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await createFirstSyncRouteDependencies(new Headers(), environment);
    expect(firstSyncRouteCompositionContract).toBe("first-sync-route-composition.v1");
    expect(result.entry).toBeInstanceOf(Object);
    expect(typeof result.entry.execute).toBe("function");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
