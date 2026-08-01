import {
  handleProjectCalibrationList,
  handleProjectCalibrationSave,
} from "@/infrastructure/project-calibration/project-calibration-http";
import { createProjectCalibrationUseCases } from "./project-calibration-route-dependencies";

export const dynamic = "force-dynamic";

const sensitiveKeyPattern =
  /user_id|service_role|authorization|cookie|token|sql|stack|core_goal|current_stage_goal|current_blocker|owner_login|full_name/i;

function logFailure(operation: "list" | "save", requestId: string) {
  return (code: string, httpStatus: number) => {
    const record = {
      contract_version: "project-calibration-failure.v1",
      phase: "phase_6",
      failure_id: crypto.randomUUID(),
      request_id: requestId,
      stage: operation === "list" ? "calibration_read" : "calibration_write",
      failure_code: code,
      http_status: httpStatus,
      repository_content_read: false,
      github_called: false,
      sync_started: false,
    };
    console.warn(JSON.stringify({
      ...record,
      sensitive_marker_found: Object.keys(record).some((key) =>
        sensitiveKeyPattern.test(key),
      ),
    }));
  };
}

export async function GET() {
  const responseHeaders = new Headers();
  const requestId = crypto.randomUUID();
  return handleProjectCalibrationList({
    responseHeaders,
    execute: async () => {
      const useCases = await createProjectCalibrationUseCases(responseHeaders);
      return useCases.list.execute();
    },
    onFailure: logFailure("list", requestId),
  });
}

export async function POST(request: Request) {
  const responseHeaders = new Headers();
  const requestId = crypto.randomUUID();
  return handleProjectCalibrationSave({
    request,
    appOrigin: process.env.APP_ORIGIN,
    responseHeaders,
    execute: async (command) => {
      const useCases = await createProjectCalibrationUseCases(responseHeaders);
      return useCases.save.execute(command);
    },
    onFailure: logFailure("save", requestId),
  });
}
