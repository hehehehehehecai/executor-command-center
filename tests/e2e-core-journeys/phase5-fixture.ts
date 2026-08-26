import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

import type { Database } from "../../src/infrastructure/database/database.types";

const password = "Phase5-synthetic-only-password-42!";

export interface Phase5Identity {
  readonly email: string;
  readonly password: string;
  readonly userId: string;
  readonly installationId: string;
  readonly installationNumericId: number;
  readonly selectedRepositoryId: string;
  readonly repositoryId: number;
  readonly repositoryFullName: string;
  readonly projectId: string;
}

function serviceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("phase5_supabase_environment_missing");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function deleteSyntheticAuthUser(
  client: SupabaseClient<Database>,
  userId: string,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (!error || error.status === 404) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
  throw lastError ?? new Error("phase5_auth_cleanup_failed");
}

export async function seedPhase5Identity(caseNumber: number): Promise<Phase5Identity> {
  const client = serviceClient();
  const suffix = String(caseNumber).padStart(2, "0");
  const runId = process.env.PHASE5_E2E_RUN_ID;
  const runNumber = Number(process.env.PHASE5_E2E_RUN_NUMBER);
  if (!runId || !Number.isSafeInteger(runNumber)) {
    throw new Error("phase5_fixture_run_identity_missing");
  }
  const email = `phase5-${runId}-${suffix}@example.invalid`;
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fixture: "phase5-core-e2e", run: runId, case: suffix },
  });
  if (createError || !created.user) throw createError ?? new Error("phase5_auth_user_missing");

  const userId = created.user.id;
  try {
    const fixtureBase = 9_500_000_000 + runNumber * 100 + caseNumber;
    const githubUserId = fixtureBase;
    const installationNumericId = fixtureBase + 20_000_000_000;
    const repositoryId = fixtureBase + 40_000_000_000;
    const { error: identityError } = await client.rpc("ensure_user_identity", {
      p_auth_user_id: userId,
      p_github_user_id: githubUserId,
      p_github_login: `phase5-user-${suffix}`,
      p_avatar_url: null as unknown as string,
    });
    if (identityError) throw identityError;

    const { data: installationId, error: installationError } = await client.rpc(
      "register_verified_github_installation",
      {
        p_user_id: userId,
        p_installation_id: installationNumericId,
        p_github_account_id: githubUserId,
        p_github_account_login: `phase5-user-${runId}-${suffix}`,
        p_account_type: "User",
        p_repository_selection: "selected",
        p_status: "active",
        p_suspended_at: null as unknown as string,
        p_verified_at: new Date().toISOString(),
      },
    );
    if (installationError || typeof installationId !== "string") {
      throw installationError ?? new Error("phase5_installation_id_missing");
    }

    const repositoryFullName = `phase5-user-${runId}-${suffix}/repository-${suffix}`;
    const { data: selected, error: selectionError } = await client.rpc(
      "ensure_selected_github_repository",
      {
        p_user_id: userId,
        p_github_installation_id: installationId,
        p_github_repository_id: repositoryId,
        p_owner_login: `phase5-user-${runId}-${suffix}`,
        p_name: `repository-${suffix}`,
        p_full_name: repositoryFullName,
        p_visibility: "private",
        p_is_private: true,
        p_is_fork: false,
        p_is_archived: false,
        p_is_disabled: false,
        p_default_branch: "main",
      },
    );
    if (selectionError || !selected || typeof selected.id !== "string") {
      throw selectionError ?? new Error("phase5_selection_id_missing");
    }
    const selectedRepositoryId = selected.id;

    const { data: project, error: projectError } = await client.rpc(
      "save_project_calibration",
      {
        p_user_id: userId,
        p_selected_repository_id: selectedRepositoryId,
        p_core_goal: `Phase 5 case ${suffix} core goal`,
        p_current_stage_goal: `Phase 5 case ${suffix} stage goal`,
        p_status: "in_development",
        p_current_blocker: null as unknown as string,
      },
    );
    if (
      projectError ||
      !project ||
      typeof project !== "object" ||
      !("id" in project) ||
      typeof project.id !== "string"
    ) {
      throw projectError ?? new Error("phase5_project_id_missing");
    }
    const projectId = project.id;

    return {
      email,
      password,
      userId,
      installationId,
      installationNumericId,
      selectedRepositoryId,
      repositoryId,
      repositoryFullName,
      projectId,
    };
  } catch (error) {
    await deleteSyntheticAuthUser(client, userId);
    throw error;
  }
}

export async function cleanupPhase5Identity(identity: Phase5Identity | undefined) {
  if (!identity) return;
  if (!/^[0-9a-f-]{36}$/u.test(identity.userId)) {
    throw new Error("phase5_cleanup_user_invalid");
  }
  const cleanupSql = [
    "delete from app_private.beta_rate_limit_buckets",
    `where subject_fingerprint = extensions.digest('${identity.userId}'::text, 'sha256');`,
  ].join(" ");
  const cleanupResult = spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_executor-command-center",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      cleanupSql,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (cleanupResult.status !== 0) {
    throw new Error(`phase5_rate_limit_cleanup_failed:${cleanupResult.status}`);
  }
  const client = serviceClient();
  const appOrigin = process.env.APP_ORIGIN;
  const controlToken = process.env.PHASE5_E2E_CONTROL_TOKEN;
  if (!appOrigin || !controlToken) {
    throw new Error("phase5_cleanup_environment_missing");
  }
  const { data: observed, error: statusError } = await client.rpc(
    "get_account_deletion_status",
    { p_actor_user_id: identity.userId },
  );
  if (statusError || !observed || typeof observed !== "object") {
    throw statusError ?? new Error("phase5_cleanup_status_missing");
  }
  let operation = observed as unknown as {
    operationId?: string | null;
    status?: string;
  };
  if (operation.status === "active") {
    const { data: requested, error: requestError } = await client.rpc(
      "request_account_deletion",
      {
        p_actor_user_id: identity.userId,
        p_idempotency_key: `phase5-cleanup:${identity.userId}`,
        p_confirmation: `DELETE ACCOUNT ${identity.userId}`,
      },
    );
    if (requestError || !requested || typeof requested !== "object") {
      throw requestError ?? new Error("phase5_cleanup_request_missing");
    }
    operation = requested as unknown as typeof operation;
  }
  if (operation.status === "deleted") {
    await deleteSyntheticAuthUser(client, identity.userId);
    return;
  }
  if (!operation.operationId) {
    throw new Error("phase5_cleanup_operation_missing");
  }
  if (operation.status === "deletion_pending") {
    advanceAccountDeletionDue(operation.operationId);
  }
  const response = await fetch(
    `${appOrigin}/api/testing/phase5/account-deletion/execute`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: appOrigin,
        "x-phase5-e2e-control-token": controlToken,
      },
      body: JSON.stringify({ operationId: operation.operationId }),
    },
  );
  const result = (await response.json()) as { status?: unknown };
  if (!response.ok || result.status !== "deleted") {
    throw new Error(`phase5_cleanup_not_completed:${String(result.status)}`);
  }
}

export async function prepareCompletedSync(identity: Phase5Identity) {
  const client = serviceClient();
  const { data: created, error: createError } = await client.rpc("create_sync_run", {
    p_project_id: identity.projectId,
    p_idempotency_key: `phase5-brief:${identity.projectId}`,
    p_trigger_source: "first_sync",
  });
  if (createError || !created || typeof created !== "object") {
    throw createError ?? new Error("phase5_sync_run_missing");
  }
  const run = created as { id?: unknown; version?: unknown; queued_at?: unknown };
  if (
    typeof run.id !== "string" ||
    typeof run.version !== "number" ||
    typeof run.queued_at !== "string"
  ) {
    throw new Error("phase5_sync_run_invalid");
  }
  const startedAt = new Date(Math.max(Date.parse(run.queued_at), Date.now())).toISOString();
  const { data: running, error: runningError } = await client.rpc("transition_sync_run", {
    p_project_id: identity.projectId,
    p_run_id: run.id,
    p_expected_status: "queued",
    p_expected_version: run.version,
    p_target_status: "running",
    p_transitioned_at: startedAt,
    p_progress_cursor: null as unknown as string,
    p_error_code: null as unknown as string,
    p_error_summary: null as unknown as string,
  });
  if (runningError || !running || typeof running !== "object") {
    throw runningError ?? new Error("phase5_sync_running_missing");
  }
  const runningVersion = (running as { version?: unknown }).version;
  if (typeof runningVersion !== "number") throw new Error("phase5_sync_running_invalid");
  const finishedAt = new Date(Date.parse(startedAt) + 1_000).toISOString();
  const { error: completedError } = await client.rpc("transition_sync_run", {
    p_project_id: identity.projectId,
    p_run_id: run.id,
    p_expected_status: "running",
    p_expected_version: runningVersion,
    p_target_status: "completed",
    p_transitioned_at: finishedAt,
    p_progress_cursor: null as unknown as string,
    p_error_code: null as unknown as string,
    p_error_summary: null as unknown as string,
  });
  if (completedError) throw completedError;
}

export function advanceAccountDeletionDue(operationId: string) {
  if (!/^[0-9a-f-]{36}$/u.test(operationId)) {
    throw new Error("phase5_account_deletion_operation_invalid");
  }
  const sql = [
    "with authoritative_time as (select clock_timestamp() as now)",
    "update public.account_deletion_operations operation",
    "set requested_at = authoritative_time.now - interval '7 days 1 minute',",
    "due_at = authoritative_time.now - interval '1 minute'",
    "from authoritative_time",
    `where operation_id = '${operationId}'::uuid and status = 'deletion_pending';`,
  ].join(" ");
  const result = spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_executor-command-center",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    const diagnostic = String(result.stderr || result.stdout)
      .trim()
      .replaceAll(/\s+/gu, " ")
      .slice(0, 400);
    throw new Error(
      `phase5_account_deletion_clock_fixture_failed:${result.status}:${diagnostic}`,
    );
  }
}
