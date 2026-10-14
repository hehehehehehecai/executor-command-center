import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { fixtureEvent, workspaceConfiguration, workspaceSql } from "../workspace/workspace-fixture";
import { verifyIsolatedDatabase } from "../../../scripts/isolated-test-target.mjs";

export function contextFixture(configuration: ReturnType<typeof workspaceConfiguration>, label: string) {
  const ids = { userId: randomUUID(), identityId: randomUUID(), installationId: randomUUID(), selectedRepositoryId: randomUUID(), label, runId: `t03-${randomUUID()}` };
  const numeric = Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 12), 16);
  const email = `${ids.runId}@example.invalid`, password = "T03-synthetic-session-only-42!";
  const admin = createClient(configuration.apiUrl, configuration.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  fixtureEvent("t03_registered_before_creation", { ...ids, generatedProjectLineage: { parent: ids.selectedRepositoryId, mechanism: "server_random_uuid_recorded_on_response" } });
  return {
    ...ids, email, password,
    async seed() {
      const result = await admin.auth.admin.createUser({ id: ids.userId, email, password, email_confirm: true });
      if (result.error || result.data.user?.id !== ids.userId) throw new Error("context_fixture_user_creation_failed");
      workspaceSql(`BEGIN;
        insert into public.users(id) values ('${ids.userId}');
        insert into public.github_identities(id,user_id,github_user_id,github_login) values ('${ids.identityId}','${ids.userId}',${numeric},'${ids.runId}');
        insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at) values ('${ids.installationId}','${ids.userId}',${numeric},${numeric},'${ids.runId}','User','selected','active',now());
        insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch) values ('${ids.selectedRepositoryId}','${ids.userId}','${ids.installationId}',${numeric},'${ids.runId}','repository','${ids.runId}/repository','private',true,false,false,false,'main');
        COMMIT;`);
      fixtureEvent("t03_created", ids);
    },
    observe(projectId: string) { fixtureEvent("t03_generated_project_observed", { ...ids, projectId }); },
    async cleanup() {
      workspaceSql(`select public.cancel_account_deletion(user_id,operation_id) from public.account_deletion_operations where user_id='${ids.userId}' and status='deletion_pending';`);
      workspaceSql(`delete from public.selected_repositories where id='${ids.selectedRepositoryId}' and user_id='${ids.userId}';`);
      const result = await admin.auth.admin.deleteUser(ids.userId);
      if (result.error && result.error.status !== 404) throw new Error("context_fixture_cleanup_failed");
      workspaceSql(`delete from public.account_deletion_operations where user_id='${ids.userId}';`);
      const remaining = Number(workspaceSql(`SELECT (SELECT count(*) FROM auth.users WHERE id='${ids.userId}')+(SELECT count(*) FROM public.users WHERE id='${ids.userId}')+(SELECT count(*) FROM public.github_installations WHERE id='${ids.installationId}')+(SELECT count(*) FROM public.selected_repositories WHERE id='${ids.selectedRepositoryId}')+(SELECT count(*) FROM public.projects WHERE user_id='${ids.userId}')+(SELECT count(*) FROM public.account_deletion_operations WHERE user_id='${ids.userId}')+(SELECT count(*) FROM auth.sessions WHERE user_id='${ids.userId}');`));
      fixtureEvent("t03_cleanup_verified", { ...ids, remaining });
      if (remaining !== 0) throw new Error("context_fixture_cleanup_incomplete");
    },
  };
}
export type ContextFixture = ReturnType<typeof contextFixture>;

// A real independent PostgreSQL session owns the lock. Only the verified
// container's Unix socket is used; a marker proves acquisition before the race.
export async function holdSqlLock(statement: string) {
  const target = verifyIsolatedDatabase();
  const child = spawn("docker", ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine", "exec", "-i", target.containerId, "psql", "-X", "-h", "/var/run/postgresql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A"], { windowsHide: true, stdio: "pipe" });
  let output = "", errors = "";
  child.stdout.on("data", data => { output += String(data); });
  child.stderr.on("data", data => { errors += String(data); });
  const done = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`context_lock_session_failed_${code}:${errors}`)));
  });
  // Register rejection handling immediately, including failures before the marker.
  void done.catch(() => undefined);
  child.stdin.write(`BEGIN; SET LOCAL statement_timeout='20s'; ${statement}; SELECT 'T03_LOCK_ACQUIRED';\n`);
  const deadline = Date.now() + 20_000;
  while (!output.includes("T03_LOCK_ACQUIRED")) {
    if (child.exitCode !== null || Date.now() > deadline) { child.stdin.end("ROLLBACK;\n"); await done; throw new Error("context_lock_acquisition_timeout"); }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return { async finish(statement = "ROLLBACK;") { child.stdin.end(`${statement}\n`); await done; } };
}
