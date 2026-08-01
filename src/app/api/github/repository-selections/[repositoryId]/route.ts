import { handleRepositoryDeselection } from "@/infrastructure/github-repository-selection/github-repository-selection-http";
import { createRepositorySelectionUseCases } from "../repository-selection-route-dependencies";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly repositoryId: string }>;
};

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  const responseHeaders = new Headers();
  return handleRepositoryDeselection({
    request,
    appOrigin: process.env.APP_ORIGIN,
    responseHeaders,
    repositoryId: async () => (await context.params).repositoryId,
    execute: async (repositoryId) => {
      const useCases =
        await createRepositorySelectionUseCases(responseHeaders);
      await useCases.deselect.execute({ repositoryId });
    },
    onFailure: (code, httpStatus) => {
      const record = {
        contract_version: "github-repository-selection-failure.v2",
        phase: "phase_5",
        failure_id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        stage: "selection_delete",
        failure_code: code,
        selection_operation: "deselect",
        http_status: httpStatus,
        project_created: false,
        sync_started: false,
      };
      const sensitiveMarkerFound = Object.keys(record).some((key) =>
        /ownerlogin|fullname|visibility|isprivate|token|authorization|cookie|service_role|installation_id|user_id|email|sql/i.test(
          key,
        ),
      );
      console.warn(
        JSON.stringify({
          ...record,
          sensitive_marker_found: sensitiveMarkerFound,
        }),
      );
    },
  });
}
