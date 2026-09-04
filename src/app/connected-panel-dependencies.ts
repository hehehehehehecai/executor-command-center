import "server-only";

import { cookies } from "next/headers";

import type { DecisionArchiveConnectedPort } from "@/features/decision-archive";
import type { FlightLogConnectedPort } from "@/features/flight-log";
import type { MissionControlConnectedPort } from "@/features/mission-control";
import type { ProjectGalaxyConnectedPort } from "@/features/project-galaxy";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import {
  SupabaseConnectedPanelReader,
  type ConnectedPanelData,
  type ConnectedPanelSessionClient,
} from "@/infrastructure/connected-panels/supabase-connected-panel-reader";
import {
  SupabaseProjectFreshnessReader,
  type ProjectFreshnessSessionClient,
} from "@/infrastructure/synchronization/supabase-project-freshness-reader";

import {
  mapDecisionArchiveConnectedSource,
  mapFlightLogConnectedSource,
  mapMissionControlConnectedSource,
  mapProjectGalaxyConnectedSource,
} from "./connected-panel-source-mappers";

export const connectedPanelCompositionContract =
  "connected-panel-production-composition.v1" as const;

type Runtime = {
  readonly client: ConnectedPanelSessionClient & ProjectFreshnessSessionClient;
  readonly session: SupabaseVerifiedSessionReader;
};

async function runtime(): Promise<Runtime> {
  const client = createSupabaseServerClient({
    environment: {
      APP_ORIGIN: process.env.APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookieStore: await cookies(),
    responseHeaders: new Headers(),
  });
  return {
    client: client as unknown as Runtime["client"],
    session: new SupabaseVerifiedSessionReader(client),
  };
}

function failure(code: "connected_panel_not_found" | "connected_panel_unauthenticated") {
  return new Error(code);
}

async function authenticatedData(
  value: Runtime,
  projectId: string | null,
): Promise<{ readonly data: ConnectedPanelData; readonly userId: string }> {
  const userId = await value.session.getVerifiedUserId();
  if (userId === null) throw failure("connected_panel_unauthenticated");
  const data = await new SupabaseConnectedPanelReader(value.client).read({
    userId,
    projectId,
  });
  if (data === null) throw failure("connected_panel_not_found");
  return { data, userId };
}

export async function createProjectGalaxyProductionConnectedPort(
  projectId: string | null,
  now: () => string = () => new Date().toISOString(),
): Promise<ProjectGalaxyConnectedPort> {
  const value = await runtime();
  return {
    async load() {
      const authenticated = await authenticatedData(value, projectId);
      const freshness = await new SupabaseProjectFreshnessReader(value.client).read({
        userId: authenticated.userId,
        projectId: authenticated.data.project.id,
        now: now(),
      });
      if (freshness === null || freshness.projectId !== authenticated.data.project.id) {
        throw failure("connected_panel_not_found");
      }
      return mapProjectGalaxyConnectedSource(authenticated.data, {
        kind: "known",
        input: freshness.input,
      });
    },
  };
}

export async function createMissionControlProductionConnectedPort(
  projectId: string | null,
): Promise<MissionControlConnectedPort> {
  const value = await runtime();
  return {
    async load() {
      return mapMissionControlConnectedSource(
        (await authenticatedData(value, projectId)).data,
      );
    },
  };
}

export async function createDecisionArchiveProductionConnectedPort(
  projectId: string | null,
): Promise<DecisionArchiveConnectedPort> {
  const value = await runtime();
  return {
    async load() {
      return mapDecisionArchiveConnectedSource(
        (await authenticatedData(value, projectId)).data,
      );
    },
  };
}

export async function createFlightLogProductionConnectedPort(
  projectId: string | null,
): Promise<FlightLogConnectedPort> {
  const value = await runtime();
  return {
    async load() {
      return mapFlightLogConnectedSource(
        (await authenticatedData(value, projectId)).data,
      );
    },
  };
}
