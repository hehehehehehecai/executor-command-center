import {
  parseProjectCalibrationInput,
  type ProjectCalibrationCommand,
  type ProjectCalibrationView,
} from "@/domain/project-calibration/project-calibration";

export const projectCalibrationHttpContract = "project-calibration-http.v1" as const;
export const projectCalibrationFailureContract =
  "project-calibration-failure.v1" as const;

export const projectCalibrationFailureCodes = [
  "project_calibration_unauthenticated",
  "project_calibration_invalid_request",
  "project_calibration_selected_repository_not_found",
  "project_calibration_selected_repository_wrong_user",
  "project_calibration_conflict",
  "project_calibration_storage_failed",
  "project_calibration_configuration_missing",
] as const;

const publicCodes = new Set<string>(
  projectCalibrationFailureCodes.filter(
    (code) => code !== "project_calibration_selected_repository_wrong_user",
  ),
);
const safeMessage = "Project calibration could not be completed.";
type FailureHandler = (code: string, status: number) => void;

function statusFor(code: string) {
  if (code === "project_calibration_unauthenticated") return 401;
  if (code === "project_calibration_invalid_request") return 400;
  if (code === "project_calibration_selected_repository_not_found") return 404;
  if (code === "project_calibration_conflict") return 409;
  return 503;
}

function secureHeaders(mutation: boolean, source?: Headers) {
  const headers = new Headers(source);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  const vary = new Set(
    (headers.get("vary") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  vary.add("Cookie");
  if (mutation) vary.add("Origin");
  headers.set("vary", [...vary].join(", "));
  return headers;
}

function failureResponse(
  error: unknown,
  mutation: boolean,
  responseHeaders?: Headers,
  onFailure?: FailureHandler,
) {
  const candidate = error instanceof Error ? error.message : "";
  const code = publicCodes.has(candidate)
    ? candidate
    : "project_calibration_storage_failed";
  const status = statusFor(code);
  onFailure?.(code, status);
  return Response.json(
    { error: { code, message: safeMessage } },
    { status, headers: secureHeaders(mutation, responseHeaders) },
  );
}

function assertOrigin(request: Request, appOrigin: string | undefined) {
  try {
    if (!appOrigin) throw new Error("missing");
    const parsed = new URL(appOrigin);
    if (
      parsed.origin !== appOrigin ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      request.headers.get("origin") !== parsed.origin
    ) {
      throw new Error("origin_forbidden");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "origin_forbidden") throw error;
    throw new Error("project_calibration_configuration_missing", { cause: error });
  }
}

export async function handleProjectCalibrationList(input: {
  readonly execute: () => Promise<readonly ProjectCalibrationView[]>;
  readonly responseHeaders?: Headers;
  readonly onFailure?: FailureHandler;
}) {
  try {
    return Response.json(
      { projects: await input.execute() },
      { status: 200, headers: secureHeaders(false, input.responseHeaders) },
    );
  } catch (error) {
    return failureResponse(error, false, input.responseHeaders, input.onFailure);
  }
}

export async function handleProjectCalibrationSave(input: {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly execute: (command: ProjectCalibrationCommand) => Promise<ProjectCalibrationView>;
  readonly responseHeaders?: Headers;
  readonly onFailure?: FailureHandler;
}) {
  try {
    assertOrigin(input.request, input.appOrigin);
    const contentType = input.request.headers.get("content-type")?.split(";")[0]?.trim();
    if (contentType?.toLowerCase() !== "application/json") {
      throw new Error("project_calibration_invalid_request");
    }
    let raw: unknown;
    try {
      raw = await input.request.json();
    } catch (error) {
      throw new Error("project_calibration_invalid_request", { cause: error });
    }
    const command = parseProjectCalibrationInput(raw);
    return Response.json(
      { project: await input.execute(command) },
      { status: 200, headers: secureHeaders(true, input.responseHeaders) },
    );
  } catch (error) {
    const normalized =
      error instanceof Error && error.message === "origin_forbidden"
        ? new Error("project_calibration_invalid_request")
        : error;
    if (error instanceof Error && error.message === "origin_forbidden") {
      const response = failureResponse(
        new Error("project_calibration_invalid_request"),
        true,
        input.responseHeaders,
        input.onFailure,
      );
      return new Response(response.body, {
        status: 403,
        headers: response.headers,
      });
    }
    return failureResponse(normalized, true, input.responseHeaders, input.onFailure);
  }
}
