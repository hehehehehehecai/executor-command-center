import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVerifiedUserId: vi.fn(),
  readData: vi.fn(),
  readFreshness: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}));
vi.mock("@/infrastructure/auth/supabase-server-client", () => ({
  createSupabaseServerClient: vi.fn(() => ({ auth: {}, from: vi.fn() })),
}));
vi.mock("@/infrastructure/auth/supabase-verified-session-reader", () => ({
  SupabaseVerifiedSessionReader: class {
    getVerifiedUserId = mocks.getVerifiedUserId;
  },
}));
vi.mock("@/infrastructure/connected-panels/supabase-connected-panel-reader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/connected-panels/supabase-connected-panel-reader")>();
  return {
    ...actual,
    SupabaseConnectedPanelReader: class {
      read = mocks.readData;
    },
  };
});
vi.mock("@/infrastructure/synchronization/supabase-project-freshness-reader", () => ({
  SupabaseProjectFreshnessReader: class {
    read = mocks.readFreshness;
  },
}));

import {
  createMissionControlProductionConnectedPort,
  createProjectGalaxyProductionConnectedPort,
} from "./connected-panel-dependencies";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-29T06:00:00.000Z";
const connectedData = {
  project: {
    id: projectId,
    name: "executor-stage6-staging-fixture",
    repositoryFullName: "hecaitest1/executor-stage6-staging-fixture",
    repositoryVisibility: "private" as const,
    defaultBranch: "main",
    status: "polishing" as const,
    coreGoal: "Ship the safe beta",
    currentStageGoal: "Verify connected panels",
    currentBlocker: null,
    updatedAt: "2026-08-29T05:00:00.000Z",
  },
  activities: [],
  syncRuns: [],
  briefs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVerifiedUserId.mockResolvedValue(userId);
  mocks.readData.mockResolvedValue(connectedData);
  mocks.readFreshness.mockResolvedValue({
    projectId,
    input: {
      provenance: "real",
      authorizationRevoked: false,
      latestRun: null,
      lastSuccessfulAt: null,
      coverageComplete: true,
      now,
    },
  });
});

describe("production Connected panel composition", () => {
  it("starts from the verified user and aligns Project Galaxy freshness to the owned project", async () => {
    const port = await createProjectGalaxyProductionConnectedPort(projectId, () => now);

    const source = await port.load();

    expect(mocks.readData).toHaveBeenCalledWith({ userId, projectId });
    expect(mocks.readFreshness).toHaveBeenCalledWith({ userId, projectId, now });
    expect(source.project).toEqual({
      id: projectId,
      name: "executor-stage6-staging-fixture",
      repositoryLabel: "hecaitest1/executor-stage6-staging-fixture",
    });
    expect(source.freshness).toMatchObject({ kind: "known" });
  });

  it("rejects an unauthenticated request before reading any project facts", async () => {
    mocks.getVerifiedUserId.mockResolvedValue(null);
    const port = await createMissionControlProductionConnectedPort(null);

    await expect(port.load()).rejects.toThrow("connected_panel_unauthenticated");
    expect(mocks.readData).not.toHaveBeenCalled();
  });

  it("keeps a missing project indistinguishable from an inaccessible project", async () => {
    mocks.readData.mockResolvedValue(null);
    const port = await createMissionControlProductionConnectedPort(projectId);

    await expect(port.load()).rejects.toThrow("connected_panel_not_found");
  });
});
