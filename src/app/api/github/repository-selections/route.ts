import {
  handleRepositorySelection,
  handleSelectedRepositoryList,
} from "@/infrastructure/github-repository-selection/github-repository-selection-http";
import { createRepositorySelectionUseCases } from "./repository-selection-route-dependencies";

export const dynamic = "force-dynamic";

const sensitiveKeyPattern =
  /ownerlogin|fullname|visibility|isprivate|token|app_jwt|authorization|cookie|service_role|installation_id|user_id|email|sql/i;

function logFailure(
  operation: "list" | "select",
  requestId: string,
  repositoryId: number | null,
) {
  return (code: string, httpStatus: number) => {
    const record = {
      contract_version: "github-repository-selection-failure.v1",
      phase: "phase_5",
      failure_id: crypto.randomUUID(),
      request_id: requestId,
      stage: operation === "list" ? "selection_read" : "selection_write",
      failure_code: code,
      repository_id: repositoryId,
      selection_operation: operation,
      http_status: httpStatus,
      project_created: false,
      sync_started: false,
    };
    const sensitiveMarkerFound = Object.keys(record).some((key) =>
      sensitiveKeyPattern.test(key),
    );
    console.warn(
      JSON.stringify({
        ...record,
        sensitive_marker_found: sensitiveMarkerFound,
      }),
    );
  };
}

export async function GET() {
  const responseHeaders = new Headers();
  const requestId = crypto.randomUUID();
  return handleSelectedRepositoryList({
    responseHeaders,
    execute: async () => {
      const useCases =
        await createRepositorySelectionUseCases(responseHeaders);
      return useCases.list.execute();
    },
    onFailure: logFailure("list", requestId, null),
  });
}

export async function POST(request: Request) {
  const responseHeaders = new Headers();
  const requestId = crypto.randomUUID();
  let repositoryId: number | null = null;
  return handleRepositorySelection({
    request,
    appOrigin: process.env.APP_ORIGIN,
    responseHeaders,
    execute: async (validatedRepositoryId) => {
      repositoryId = validatedRepositoryId;
      const useCases =
        await createRepositorySelectionUseCases(responseHeaders);
      return useCases.select.execute({
        repositoryId: validatedRepositoryId,
      });
    },
    onFailure: (code, status) =>
      logFailure("select", requestId, repositoryId)(code, status),
  });
}
