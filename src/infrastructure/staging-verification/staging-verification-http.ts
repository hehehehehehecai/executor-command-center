import { z } from "zod";

import {
  stagingVerificationContract,
  type StagingVerificationOperation,
} from "@/application/staging-verification/staging-verification";

export const stagingVerificationCookieName =
  "executor-staging-verification-token";

const maximumBodyBytes = 4_096;
const bodySchema = z.object({
  projectId: z.string().uuid(),
  caseId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/),
}).strict();

type BaseDependencies = {
  readonly request: Request;
  readonly appOrigin: string | undefined;
  readonly operation: StagingVerificationOperation;
  readonly expectedProjectId: string;
  readonly getVerifiedUserId: () => Promise<string | null>;
  readonly authorize: (input: {
    readonly userId: string;
    readonly projectId: string;
  }) => Promise<void>;
};

function responseHeaders(source?: Headers) {
  const headers = new Headers(source);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("vary", "Cookie, Origin");
  return headers;
}

function cookieHeader(input: {
  readonly operation: StagingVerificationOperation;
  readonly value: string;
  readonly maxAge: number;
}) {
  return [
    `${stagingVerificationCookieName}=${input.value}`,
    `Path=/api/staging-verification/${input.operation}`,
    `Max-Age=${input.maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=lax",
  ].join("; ");
}

function clearCookie(
  headers: Headers,
  operation: StagingVerificationOperation,
) {
  headers.append("set-cookie", cookieHeader({ operation, value: "", maxAge: 0 }));
}

function errorCode(error: unknown) {
  const value = error instanceof Error ? error.message : "";
  const allowed = new Set([
    "staging_verification_origin_forbidden",
    "staging_verification_unauthenticated",
    "staging_verification_request_invalid",
    "staging_verification_forbidden",
    "staging_verification_token_invalid",
    "staging_verification_token_expired",
    "staging_verification_token_replayed",
    "staging_verification_token_wrong_user",
    "staging_verification_token_binding_mismatch",
    "staging_verification_unavailable",
    "staging_verification_failed",
  ]);
  return allowed.has(value) ? value : "staging_verification_token_invalid";
}

function status(code: string) {
  if (code === "staging_verification_unauthenticated") return 401;
  if (code === "staging_verification_request_invalid") return 400;
  if (code === "staging_verification_unavailable") return 404;
  if (code === "staging_verification_failed") return 503;
  return 403;
}

function failure(code: string, headers: Headers) {
  return Response.json(
    { error: { code } },
    { status: status(code), headers },
  );
}

function assertOrigin(request: Request, appOrigin: string | undefined) {
  if (!appOrigin) throw new Error("staging_verification_unavailable");
  let expected: URL;
  try {
    expected = new URL(appOrigin);
  } catch {
    throw new Error("staging_verification_unavailable");
  }
  if (expected.origin !== appOrigin || request.headers.get("origin") !== appOrigin) {
    throw new Error("staging_verification_origin_forbidden");
  }
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBodyBytes) {
    throw new Error("staging_verification_request_invalid");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBodyBytes) {
    throw new Error("staging_verification_request_invalid");
  }
  try {
    if (contentType === "application/json") {
      return bodySchema.parse(JSON.parse(text) as unknown);
    }
    if (contentType === "application/x-www-form-urlencoded") {
      const form = new URLSearchParams(text);
      const keys = [...form.keys()];
      if (
        keys.length !== 2
        || form.getAll("projectId").length !== 1
        || form.getAll("caseId").length !== 1
        || keys.some((key) => key !== "projectId" && key !== "caseId")
      ) {
        throw new Error("staging_verification_request_invalid");
      }
      return bodySchema.parse({
        projectId: form.get("projectId"),
        caseId: form.get("caseId"),
      });
    }
    throw new Error("staging_verification_request_invalid");
  } catch {
    throw new Error("staging_verification_request_invalid");
  }
}

function cookie(request: Request) {
  const source = request.headers.get("cookie") ?? "";
  for (const part of source.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === stagingVerificationCookieName) return rest.join("=") || null;
  }
  return null;
}

async function authenticate(
  input: BaseDependencies,
  body: z.infer<typeof bodySchema>,
) {
  if (body.projectId !== input.expectedProjectId) {
    throw new Error("staging_verification_forbidden");
  }
  const userId = await input.getVerifiedUserId();
  if (!userId) throw new Error("staging_verification_unauthenticated");
  try {
    await input.authorize({ userId, projectId: body.projectId });
  } catch {
    throw new Error("staging_verification_forbidden");
  }
  return userId;
}

export async function handleStagingVerificationTicketIssue(
  input: BaseDependencies & {
    readonly responseHeaders?: Headers;
    readonly issue: (input: {
      readonly userId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly operation: StagingVerificationOperation;
    }) => Promise<{
      readonly rawToken: string;
      readonly contractVersion: typeof stagingVerificationContract;
      readonly caseId: string;
      readonly projectId: string;
      readonly operation: StagingVerificationOperation;
    }>;
  },
) {
  const headers = responseHeaders(input.responseHeaders);
  try {
    assertOrigin(input.request, input.appOrigin);
    const body = await parseBody(input.request);
    const userId = await authenticate(input, body);
    const issued = await input.issue({ ...body, userId, operation: input.operation });
    headers.append("set-cookie", cookieHeader({
      operation: input.operation,
      value: issued.rawToken,
      maxAge: 300,
    }));
    return Response.json({
      contractVersion: stagingVerificationContract,
      result: "ticket_issued",
      caseId: body.caseId,
      operation: input.operation,
    }, { status: 201, headers });
  } catch (error) {
    return failure(errorCode(error), headers);
  }
}

export async function handleStagingVerificationExecution(
  input: BaseDependencies & {
    readonly responseHeaders?: Headers;
    readonly consume: (input: {
      readonly userId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly operation: StagingVerificationOperation;
      readonly rawToken: string | null;
    }) => Promise<unknown>;
    readonly execute: (input: {
      readonly userId: string;
      readonly projectId: string;
      readonly caseId: string;
      readonly operation: StagingVerificationOperation;
    }) => Promise<unknown>;
  },
) {
  const headers = responseHeaders(input.responseHeaders);
  try {
    assertOrigin(input.request, input.appOrigin);
    const body = await parseBody(input.request);
    const userId = await authenticate(input, body);
    const rawToken = cookie(input.request);
    await input.consume({ ...body, userId, operation: input.operation, rawToken });
    clearCookie(headers, input.operation);
    let evidence: unknown;
    try {
      evidence = await input.execute({ ...body, userId, operation: input.operation });
    } catch (error) {
      throw new Error("staging_verification_failed", { cause: error });
    }
    return Response.json({
      contractVersion: stagingVerificationContract,
      caseId: body.caseId,
      operation: input.operation,
      evidence,
    }, { status: 200, headers });
  } catch (error) {
    clearCookie(headers, input.operation);
    return failure(errorCode(error), headers);
  }
}
