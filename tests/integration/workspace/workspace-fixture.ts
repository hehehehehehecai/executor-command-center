import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readIsolatedStatus, verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";

export function workspaceConfiguration() {
  const result = readIsolatedStatus();
  if (result.status !== 0) throw new Error("workspace_local_status_failed");
  const values = Object.fromEntries(result.stdout.split(/\r?\n/).map(line => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter((match): match is RegExpMatchArray => match !== null).map(match => [match[1], match[2].replace(/"$/, "")]));
  if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) throw new Error("workspace_fixture_configuration_missing");
  return { apiUrl: values.API_URL, anonKey: values.ANON_KEY, serviceRoleKey: values.SERVICE_ROLE_KEY };
}

export function workspaceSql(statement: string): string {
  const target = verifyIsolatedDatabase();
  const result = spawnSync("docker", ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", "exec", target.containerId, "psql", "-X", "-h", "/var/run/postgresql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", statement], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("workspace_fixture_sql_failed");
  return result.stdout.trim();
}

export function fixtureEvent(event: string, values: Record<string, unknown>) {
  const manifest = process.env.EXECUTOR_TEST_TARGET_FILE;
  if (!manifest) throw new Error("workspace_fixture_manifest_required");
  appendFileSync(path.join(path.dirname(manifest), "fixture-journal.jsonl"), JSON.stringify({ at: new Date().toISOString(), event, executionBatchId: process.env.EXECUTOR_TEST_EXECUTION_BATCH_ID, ...values }) + "\n");
}

export function registeredWorkspaceFixture(configuration: ReturnType<typeof workspaceConfiguration>, label: string) {
  const runId = `t011-${randomUUID()}`;
  const identity = { userId: randomUUID(), installationId: randomUUID(), selectedRepositoryId: randomUUID(), projectId: randomUUID(), identityId: randomUUID(), runId, label };
  const email = `${runId}@example.invalid`;
  const password = "T011-synthetic-session-only-42!";
  const numeric = Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 12), 16);
  const repositoryFullName = `${runId}/repository`;
  const admin = createClient(configuration.apiUrl, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  fixtureEvent("registered_before_creation", identity);
  return {
    ...identity, email, password, repositoryFullName,
    async seed() {
      const result = await admin.auth.admin.createUser({ id: identity.userId, email, password, email_confirm: true, user_metadata: { fixture: "t011-workspace", run: runId } });
      if (result.error || result.data.user?.id !== identity.userId) throw new Error("workspace_fixture_user_creation_failed");
      const { userId, identityId, installationId, selectedRepositoryId, projectId } = identity;
      workspaceSql(`BEGIN;
        insert into public.users(id) values ('${userId}');
        insert into public.github_identities(id,user_id,github_user_id,github_login) values ('${identityId}','${userId}',${numeric},'${runId}');
        insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at) values ('${installationId}','${userId}',${numeric},${numeric},'${runId}','User','selected','active',now());
        insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch) values ('${selectedRepositoryId}','${userId}','${installationId}',${numeric},'${runId}','repository','${repositoryFullName}','private',true,false,false,false,'main');
        insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status) values ('${projectId}','${userId}','${selectedRepositoryId}','Synthetic goal','Synthetic stage','in_development');
        COMMIT;`);
      fixtureEvent("created", identity);
    },
    async cleanup() {
      // Only registered IDs are eligible; selected rows precede their restricted installation FK.
      workspaceSql(`delete from public.selected_repositories where id='${identity.selectedRepositoryId}' and user_id='${identity.userId}';`);
      const result = await admin.auth.admin.deleteUser(identity.userId);
      if (result.error && result.error.status !== 404) throw new Error("workspace_fixture_cleanup_failed");
      const remaining = Number(workspaceSql(`SELECT (SELECT count(*) FROM auth.users WHERE id='${identity.userId}')+(SELECT count(*) FROM public.users WHERE id='${identity.userId}')+(SELECT count(*) FROM public.github_identities WHERE id='${identity.identityId}')+(SELECT count(*) FROM public.github_installations WHERE id='${identity.installationId}')+(SELECT count(*) FROM public.selected_repositories WHERE id='${identity.selectedRepositoryId}')+(SELECT count(*) FROM public.projects WHERE id='${identity.projectId}')+(SELECT count(*) FROM auth.sessions WHERE user_id='${identity.userId}');`));
      fixtureEvent("cleanup_verified", { ...identity, remaining });
      if (remaining !== 0) throw new Error("workspace_fixture_cleanup_incomplete");
    },
  };
}
export type WorkspaceFixture = ReturnType<typeof registeredWorkspaceFixture>;
