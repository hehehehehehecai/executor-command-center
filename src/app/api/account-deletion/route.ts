import { createAccountDeletionUseCases } from "./account-deletion-route-dependencies";

export const dynamic = "force-dynamic";

const statusByCode: Readonly<Record<string, number>> = {
  account_deletion_unauthenticated: 401,
  account_deletion_invalid_request: 400,
  account_deletion_not_found: 404,
  account_deletion_idempotency_conflict: 409,
  account_deletion_already_deleting: 409,
  account_deletion_cancel_window_closed: 409,
  account_deletion_claim_conflict: 409,
  account_deletion_dispatch_failed: 503,
  account_deletion_storage_failed: 503,
  account_deletion_configuration_missing: 503,
};

function failure(error: unknown) {
  const code = error instanceof Error && /^account_deletion_[a-z_]+$/.test(error.message)
    ? error.message : "account_deletion_storage_failed";
  return Response.json({ error: { code } }, { status: statusByCode[code] ?? 503 });
}

function trustedRequest(request: Request) {
  const expected = process.env.APP_ORIGIN;
  const origin = request.headers.get("origin");
  return Boolean(expected && origin === expected);
}

export async function GET() {
  const responseHeaders = new Headers();
  try {
    const account = await (await createAccountDeletionUseCases(responseHeaders)).status.execute();
    const response = Response.json({ account });
    responseHeaders.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!trustedRequest(request)) return failure(new Error("account_deletion_invalid_request"));
  const responseHeaders = new Headers();
  try {
    const account = await (await createAccountDeletionUseCases(responseHeaders)).request.execute(await request.json());
    const response = Response.json({ account }, { status: 202 });
    responseHeaders.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  if (!trustedRequest(request)) return failure(new Error("account_deletion_invalid_request"));
  const responseHeaders = new Headers();
  try {
    const account = await (await createAccountDeletionUseCases(responseHeaders)).cancel.execute(await request.json());
    const response = Response.json({ account });
    responseHeaders.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch (error) { return failure(error); }
}
