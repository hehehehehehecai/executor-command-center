import { describe, expect, it } from "vitest";

import {
  connectedPanelFixtureIdentities,
  resolveConnectedPanelFixtureAccess,
} from "./connected-panel-fixture";

const { userAlpha, userBeta } = connectedPanelFixtureIdentities;

describe("Connected panel fixture access", () => {
  it("stays disabled in production even when the test flag is set", () => {
    expect(
      resolveConnectedPanelFixtureAccess({
        nodeEnvironment: "production",
        fixtureEnabled: "1",
        verifiedUserId: userAlpha.userId,
        projectId: userAlpha.projectId,
      }),
    ).toEqual({ kind: "disabled" });
  });

  it("stays disabled unless the explicit development test flag is set", () => {
    expect(
      resolveConnectedPanelFixtureAccess({
        nodeEnvironment: "development",
        fixtureEnabled: undefined,
        verifiedUserId: userAlpha.userId,
        projectId: userAlpha.projectId,
      }),
    ).toEqual({ kind: "disabled" });
  });

  it("authorizes each verified fictional user only for their exact project", () => {
    const alpha = resolveConnectedPanelFixtureAccess({
      nodeEnvironment: "development",
      fixtureEnabled: "1",
      verifiedUserId: userAlpha.userId,
      projectId: userAlpha.projectId,
    });
    const beta = resolveConnectedPanelFixtureAccess({
      nodeEnvironment: "development",
      fixtureEnabled: "1",
      verifiedUserId: userBeta.userId,
      projectId: userBeta.projectId,
    });

    expect(alpha).toMatchObject({
      kind: "authorized",
      session: {
        userId: userAlpha.userId,
        projectId: userAlpha.projectId,
        projectGalaxy: { project: { id: userAlpha.projectId } },
        decisionActionContext: { actorId: userAlpha.actorId },
      },
    });
    expect(beta).toMatchObject({
      kind: "authorized",
      session: {
        userId: userBeta.userId,
        projectId: userBeta.projectId,
        projectGalaxy: { project: { id: userBeta.projectId } },
        decisionActionContext: { actorId: userBeta.actorId },
      },
    });
  });

  it("denies both cross-user project directions without returning any source", () => {
    expect(
      resolveConnectedPanelFixtureAccess({
        nodeEnvironment: "development",
        fixtureEnabled: "1",
        verifiedUserId: userAlpha.userId,
        projectId: userBeta.projectId,
      }),
    ).toEqual({ kind: "denied" });
    expect(
      resolveConnectedPanelFixtureAccess({
        nodeEnvironment: "development",
        fixtureEnabled: "1",
        verifiedUserId: userBeta.userId,
        projectId: userAlpha.projectId,
      }),
    ).toEqual({ kind: "denied" });
  });

  it("keeps same-title objects independent by stable ID and returns fresh copies", () => {
    const first = resolveConnectedPanelFixtureAccess({
      nodeEnvironment: "test",
      fixtureEnabled: "1",
      verifiedUserId: userAlpha.userId,
      projectId: userAlpha.projectId,
    });
    const second = resolveConnectedPanelFixtureAccess({
      nodeEnvironment: "test",
      fixtureEnabled: "1",
      verifiedUserId: userAlpha.userId,
      projectId: userAlpha.projectId,
    });
    const beta = resolveConnectedPanelFixtureAccess({
      nodeEnvironment: "test",
      fixtureEnabled: "1",
      verifiedUserId: userBeta.userId,
      projectId: userBeta.projectId,
    });

    expect(first.kind).toBe("authorized");
    expect(second.kind).toBe("authorized");
    expect(beta.kind).toBe("authorized");
    if (
      first.kind !== "authorized" ||
      second.kind !== "authorized" ||
      beta.kind !== "authorized"
    ) {
      throw new Error("fixture access must be authorized for this case");
    }

    expect(first.session).not.toBe(second.session);
    expect(first.session.missionControl).not.toBe(second.session.missionControl);
    expect(first.session.missionControl.suggestions[0]?.title).toBe(
      beta.session.missionControl.suggestions[0]?.title,
    );
    expect(first.session.missionControl.suggestions[0]?.id).not.toBe(
      beta.session.missionControl.suggestions[0]?.id,
    );
  });
});
