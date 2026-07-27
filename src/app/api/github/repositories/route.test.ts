// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gatewayList: vi.fn(),
  installationFind: vi.fn(),
  getVerifiedUserId: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/infrastructure/auth/supabase-server-client", () => ({
  createSupabaseServerClient: vi.fn().mockReturnValue({ auth: {} }),
}));

vi.mock("@/infrastructure/auth/supabase-verified-session-reader", () => ({
  SupabaseVerifiedSessionReader: class {
    getVerifiedUserId = mocks.getVerifiedUserId;
  },
}));

vi.mock("@/infrastructure/github/supabase-current-github-installation-query", () => ({
  SupabaseCurrentGitHubInstallationQuery: class {
    findByUserId = mocks.installationFind;
  },
}));

vi.mock("@/infrastructure/github/github-app-jwt", () => ({
  GitHubAppJwtSigner: class {},
}));

vi.mock("@/infrastructure/github/github-installation-token-client", () => ({
  GitHubInstallationTokenClient: class {},
}));

vi.mock("@/infrastructure/github/github-authorized-repository-reader", () => ({
  GitHubAuthorizedRepositoryReader: class {},
}));

vi.mock("@/infrastructure/github/github-authorized-repository-gateway", () => ({
  GitHubAuthorizedRepositoryGatewayAdapter: class {
    listAllForInstallation = mocks.gatewayList;
  },
}));

vi.mock("@/shared/configuration/server-environment", () => ({
  parseServerEnvironment: vi.fn().mockReturnValue({
    APP_ORIGIN: "https://executor.example.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role",
    GITHUB_APP_ID: "900001",
    GITHUB_APP_SLUG: "synthetic-app",
    GITHUB_APP_PRIVATE_KEY:
      "-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----",
    GITHUB_REST_API_VERSION: "2026-03-10",
  }),
}));

import { dynamic, GET } from "./route";

describe("GET /api/github/repositories composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedUserId.mockResolvedValue(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    mocks.installationFind.mockResolvedValue({
      installationId: 81001,
      repositorySelection: "selected",
      status: "active",
    });
    mocks.gatewayList.mockResolvedValue({
      repositorySelection: "selected",
      totalCount: 0,
      repositories: [],
      loadedAt: "2026-07-27T05:30:00.000Z",
    });
  });

  it("is dynamic and derives the installation without forwarding browser controls", async () => {
    const response = await GET(
      new Request(
        "https://executor.example.test/api/github/repositories?installation_id=999&page=7&per_page=1",
      ),
    );

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(mocks.installationFind).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(mocks.gatewayList).toHaveBeenCalledWith(81001);
    expect(mocks.gatewayList.mock.calls[0]).toHaveLength(1);
  });

  it("returns a cache-safe 401 before installation lookup when unauthenticated", async () => {
    mocks.getVerifiedUserId.mockResolvedValue(null);

    const response = await GET(
      new Request("https://executor.example.test/api/github/repositories"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.installationFind).not.toHaveBeenCalled();
    expect(mocks.gatewayList).not.toHaveBeenCalled();
  });
});
