import { cookies } from "next/headers";

import {
  resolveConnectedPanelFixtureAccess,
  type ConnectedPanelFixtureAccess,
} from "./connected-panel-fixture";

export async function readConnectedPanelFixtureAccess(
  projectIdOverride?: string,
): Promise<ConnectedPanelFixtureAccess> {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.CONNECTED_PANEL_E2E !== "1"
  ) {
    return { kind: "disabled" };
  }

  const cookieStore = await cookies();

  return resolveConnectedPanelFixtureAccess({
    nodeEnvironment: process.env.NODE_ENV,
    fixtureEnabled: process.env.CONNECTED_PANEL_E2E,
    verifiedUserId: cookieStore.get("connected-panel-verified-user")?.value,
    projectId:
      projectIdOverride ?? cookieStore.get("connected-panel-project")?.value,
  });
}
