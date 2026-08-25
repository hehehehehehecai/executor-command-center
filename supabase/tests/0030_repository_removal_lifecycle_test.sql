begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'public', 'repository_removal_operations',
  'minimal repository-removal tombstones exist'
);
select has_table(
  'public', 'evidence_reference_invalidations',
  'removed evidence references have durable invalidations'
);
select has_function(
  'public', 'execute_repository_removal',
  array['uuid', 'uuid', 'text', 'text', 'uuid', 'text'],
  'one atomic service-only repository-removal RPC exists'
);
select function_privs_are(
  'public', 'execute_repository_removal',
  array['uuid', 'uuid', 'text', 'text', 'uuid', 'text'],
  'service_role', array['EXECUTE'],
  'service role can execute the controlled removal RPC'
);
select function_privs_are(
  'public', 'execute_repository_removal',
  array['uuid', 'uuid', 'text', 'text', 'uuid', 'text'],
  'authenticated', array[]::text[],
  'authenticated clients cannot bypass the application boundary'
);
select results_eq(
  $$
    select pg_get_userbyid(procedure_record.proowner), procedure_record.prosecdef,
      procedure_record.proconfig[1]::text collate "default"
    from pg_proc procedure_record
    join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'execute_repository_removal'
  $$,
  $$values ('postgres'::name, true, 'search_path=""'::text)$$,
  'the RPC is postgres-owned SECURITY DEFINER with an empty search path'
);

select policies_are(
  'public', 'repository_removal_operations',
  array['repository_removal_operations_select_own'],
  'operation tombstones expose only own-row reads'
);
select policies_are(
  'public', 'evidence_reference_invalidations',
  array['evidence_reference_invalidations_select_own'],
  'evidence invalidations expose only own-row reads'
);
select ok(
  has_table_privilege('authenticated', 'public.repository_removal_operations', 'select')
    and has_table_privilege('authenticated', 'public.evidence_reference_invalidations', 'select')
    and not has_table_privilege(
      'authenticated', 'public.repository_removal_operations', 'insert,update,delete'
    )
    and not has_table_privilege(
      'authenticated', 'public.evidence_reference_invalidations', 'insert,update,delete'
    ),
  'authenticated access is read-only and RLS constrained'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase6-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase6-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );
insert into public.users (id) values
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002');
insert into public.github_identities (user_id, github_user_id, github_login) values
  ('a1000000-0000-4000-8000-000000000001', 610001, 'phase6-owner'),
  ('a1000000-0000-4000-8000-000000000002', 610002, 'phase6-other');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'a1100000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    611001, 610001, 'phase6-owner', 'User', 'selected', 'active', now()
  ),
  (
    'a1100000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    611002, 610002, 'phase6-other', 'User', 'selected', 'active', now()
  );

select public.ensure_selected_github_repository(
  'a1000000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  612001, 'phase6-owner', 'remove-target', 'phase6-owner/remove-target',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'a1000000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  612002, 'phase6-owner', 'delete-target', 'phase6-owner/delete-target',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'a1000000-0000-4000-8000-000000000002',
  'a1100000-0000-4000-8000-000000000002',
  612003, 'phase6-other', 'other-a', 'phase6-other/other-a',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'a1000000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  612005, 'phase6-owner', 'rollback-target', 'phase6-owner/rollback-target',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'a1000000-0000-4000-8000-000000000002',
  'a1100000-0000-4000-8000-000000000002',
  612004, 'phase6-other', 'other-b', 'phase6-other/other-b',
  'private', true, false, false, false, 'main'
);

select public.save_project_calibration(
  'a1000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 612001),
  'Remove target', 'Repository removal', 'in_development', null
);
select public.save_project_calibration(
  'a1000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 612002),
  'Delete target', 'Project deletion', 'in_development', null
);
select public.save_project_calibration(
  'a1000000-0000-4000-8000-000000000002',
  (select id from public.selected_repositories where github_repository_id = 612003),
  'Other A', 'Must remain unchanged', 'in_development', null
);
select public.save_project_calibration(
  'a1000000-0000-4000-8000-000000000002',
  (select id from public.selected_repositories where github_repository_id = 612004),
  'Other B', 'Must remain unchanged', 'in_development', null
);
select public.save_project_calibration(
  'a1000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 612005),
  'Rollback target', 'Retry the same operation', 'in_development', null
);

select set_config(
  'test.phase6_remove_project',
  (select id::text from public.projects where core_goal = 'Remove target'), true
);
select set_config(
  'test.phase6_delete_project',
  (select id::text from public.projects where core_goal = 'Delete target'), true
);
select set_config(
  'test.phase6_other_project',
  (select id::text from public.projects where core_goal = 'Other A'), true
);
select set_config(
  'test.phase6_rollback_project',
  (select id::text from public.projects where core_goal = 'Rollback target'), true
);

insert into public.github_commits (
  project_id, github_object_id, source_updated_at, source_version,
  message, committed_at
) values
  (
    current_setting('test.phase6_remove_project')::uuid,
    'remove-sha', now(), 'remove-v1', 'Synthetic remove target', now()
  ),
  (
    current_setting('test.phase6_delete_project')::uuid,
    'delete-sha', now(), 'delete-v1', 'Synthetic delete target', now()
  ),
  (
    current_setting('test.phase6_other_project')::uuid,
    'other-sha', now(), 'other-v1', 'Synthetic boundary control', now()
  ),
  (
    current_setting('test.phase6_rollback_project')::uuid,
    'rollback-sha', now(), 'rollback-v1', 'Synthetic rollback target', now()
  );
insert into public.github_document_snapshots (
  project_id, github_object_id, source_updated_at, source_version,
  document_path, document_kind, content_fingerprint
) values
  (
    current_setting('test.phase6_remove_project')::uuid,
    'remove-doc', now(), 'remove-doc-v1', 'README.md', 'readme',
    'sha256:' || repeat('a', 64)
  ),
  (
    current_setting('test.phase6_delete_project')::uuid,
    'delete-doc', now(), 'delete-doc-v1', 'docs/test.md', 'documentation',
    'sha256:' || repeat('b', 64)
  );
insert into public.sync_runs (
  project_id, idempotency_key, trigger_source
) values
  (current_setting('test.phase6_remove_project')::uuid, 'remove-sync', 'manual'),
  (current_setting('test.phase6_delete_project')::uuid, 'delete-sync', 'manual');

insert into public.project_briefs (
  user_id, project_id, range_start, range_end, prompt_version,
  schema_version, evidence_fingerprint, status, payload, completed_at
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_remove_project')::uuid,
    now() - interval '2 days', now() - interval '1 day',
    'phase6-test-v1', 'phase6-schema-v1', repeat('c', 64), 'completed',
    jsonb_build_object(
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'github_commit', 'sourceId', 'remove-sha',
        'projectId', current_setting('test.phase6_remove_project')::uuid
      ))
    ), now()
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_delete_project')::uuid,
    now() - interval '2 days', now() - interval '1 day',
    'phase6-test-v1', 'phase6-schema-v1', repeat('d', 64), 'completed',
    jsonb_build_object(
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'github_document', 'sourceId', 'delete-doc',
        'projectId', current_setting('test.phase6_delete_project')::uuid
      ))
    ), now()
  );

insert into public.energy_reservations (
  id, user_id, project_id, business_date, request_key, amount
) values
  (
    'a1200000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_remove_project')::uuid,
    date '2026-08-24', 'phase6-remove-reservation', 3
  ),
  (
    'a1200000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_delete_project')::uuid,
    date '2026-08-24', 'phase6-delete-reservation', 5
  );
insert into public.energy_ledger_entries (
  user_id, project_id, business_date, idempotency_key,
  entry_type, amount, delta, reservation_id
) values
  (
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_remove_project')::uuid,
    date '2026-08-24', 'phase6-remove-reserved',
    'reserved', 3, -3, 'a1200000-0000-4000-8000-000000000001'
  ),
  (
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_delete_project')::uuid,
    date '2026-08-24', 'phase6-delete-reserved',
    'reserved', 5, -5, 'a1200000-0000-4000-8000-000000000002'
  );

select set_config(
  'test.phase6_remove_result',
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_remove_project')::uuid,
    'REMOVE_REPOSITORY_DATA', 'phase6-remove-operation',
    current_setting('test.phase6_remove_project')::uuid,
    'REMOVE ' || current_setting('test.phase6_remove_project')
  )::text, true
);

select is(
  current_setting('test.phase6_remove_result')::jsonb->>'status',
  'completed', 'repository-data removal completes'
);
select is(
  (select repository_data_state from public.projects
    where id = current_setting('test.phase6_remove_project')::uuid),
  'removed', 'repository-data removal preserves a disabled project shell'
);
select is(
  (select count(*) from public.github_commits
    where project_id = current_setting('test.phase6_remove_project')::uuid),
  0::bigint, 'repository-derived commit rows are deleted'
);
select is(
  (select count(*) from public.github_document_snapshots
    where project_id = current_setting('test.phase6_remove_project')::uuid),
  0::bigint, 'repository-derived document rows are deleted'
);
select is(
  (select count(*) from public.sync_runs
    where project_id = current_setting('test.phase6_remove_project')::uuid),
  0::bigint, 'in-flight synchronization rows are removed atomically'
);
select is(
  (select count(*) from public.project_briefs
    where project_id = current_setting('test.phase6_remove_project')::uuid),
  0::bigint, 'AI-derived brief content is deleted'
);
select is(
  (select count(*) from public.evidence_reference_invalidations
    where target_project_id = current_setting('test.phase6_remove_project')::uuid
      and invalidation_reason = 'SOURCE_REMOVED'),
  1::bigint, 'the removed brief evidence reference is explicitly invalidated'
);
select is(
  (select count(*) from public.energy_ledger_entries
    where repository_removal_operation_id =
      (current_setting('test.phase6_remove_result')::jsonb->>'operationId')::uuid
      and project_id is null and reservation_id is null),
  2::bigint, 'reserved and compensating-release ledger facts are preserved and detached'
);
select is(
  (select coalesce(sum(delta), 0) from public.energy_ledger_entries
    where repository_removal_operation_id =
      (current_setting('test.phase6_remove_result')::jsonb->>'operationId')::uuid),
  0::bigint, 'an active reservation is released without changing account balance'
);

select throws_ok(
  format(
    $sql$insert into public.github_commits (
      project_id, github_object_id, source_updated_at, source_version,
      message, committed_at
    ) values (%L::uuid, 'late-sha', now(), 'late-v1', 'Late write', now())$sql$,
    current_setting('test.phase6_remove_project')
  ),
  'P0001', 'repository_data_unavailable',
  'late derived writes are rejected after removal starts'
);

select set_config(
  'test.phase6_replay_result',
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_remove_project')::uuid,
    'REMOVE_REPOSITORY_DATA', 'phase6-remove-operation',
    current_setting('test.phase6_remove_project')::uuid,
    'REMOVE ' || current_setting('test.phase6_remove_project')
  )::text, true
);
select is(
  current_setting('test.phase6_replay_result')::jsonb->>'operationId',
  current_setting('test.phase6_remove_result')::jsonb->>'operationId',
  'idempotent replay returns the original operation'
);
select is(
  current_setting('test.phase6_replay_result')::jsonb->>'outcome',
  'replayed', 'idempotent replay reports no second execution'
);
select is(
  (select count(*) from public.energy_ledger_entries
    where repository_removal_operation_id =
      (current_setting('test.phase6_remove_result')::jsonb->>'operationId')::uuid),
  2::bigint, 'replay creates no duplicate accounting side effect'
);

select set_config(
  'test.phase6_delete_result',
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_delete_project')::uuid,
    'DELETE_PROJECT_SUBTREE', 'phase6-delete-operation',
    current_setting('test.phase6_delete_project')::uuid,
    'DELETE ' || current_setting('test.phase6_delete_project')
  )::text, true
);
select is(
  current_setting('test.phase6_delete_result')::jsonb->>'status',
  'completed', 'project-subtree deletion completes'
);
select is(
  (select count(*) from public.projects
    where id = current_setting('test.phase6_delete_project')::uuid),
  0::bigint, 'project-subtree mode deletes the project row'
);
select is(
  (select count(*) from public.selected_repositories
    where github_repository_id = 612002),
  1::bigint, 'repository selection and GitHub installation scope remain intact'
);

select set_config(
  'test.phase6_wrong_user_result',
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000002',
    current_setting('test.phase6_remove_project')::uuid,
    'DELETE_PROJECT_SUBTREE', 'phase6-forged-operation',
    current_setting('test.phase6_remove_project')::uuid,
    'DELETE ' || current_setting('test.phase6_remove_project')
  )::text, true
);
select is(
  current_setting('test.phase6_wrong_user_result')::jsonb->'error'->>'code',
  'repository_removal_not_found',
  'cross-user access uses the non-enumerating not-found error'
);
select is(
  (select count(*) from public.github_commits
    where project_id = current_setting('test.phase6_other_project')::uuid),
  1::bigint, 'another user project is byte/row-boundary unchanged'
);
select is(
  (select count(*) from public.projects
    where user_id = 'a1000000-0000-4000-8000-000000000002'),
  2::bigint, 'both other-user projects remain present'
);

select is(
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_remove_project')::uuid,
    'DELETE_PROJECT_SUBTREE', 'phase6-confirmation-mismatch',
    current_setting('test.phase6_remove_project')::uuid,
    'REMOVE ' || current_setting('test.phase6_remove_project')
  )->'error'->>'code',
  'repository_removal_confirmation_mismatch',
  'mode and project identity are bound to exact confirmation text'
);
select is(
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_remove_project')::uuid,
    'DELETE_PROJECT_SUBTREE', 'phase6-remove-operation',
    current_setting('test.phase6_remove_project')::uuid,
    'DELETE ' || current_setting('test.phase6_remove_project')
  )->'error'->>'code',
  'repository_removal_conflict',
  'reusing an idempotency key with different parameters fails closed'
);

create function app_private.test_phase6_force_delete_failure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.project_id = current_setting('test.phase6_rollback_project')::uuid then
    raise exception using errcode = 'P0001', message = 'synthetic_delete_failure';
  end if;
  return old;
end;
$$;
create trigger github_commits_test_phase6_delete_failure
before delete on public.github_commits
for each row execute function app_private.test_phase6_force_delete_failure();

select set_config(
  'test.phase6_failed_result',
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_rollback_project')::uuid,
    'REMOVE_REPOSITORY_DATA', 'phase6-rollback-operation',
    current_setting('test.phase6_rollback_project')::uuid,
    'REMOVE ' || current_setting('test.phase6_rollback_project')
  )::text, true
);
select is(
  current_setting('test.phase6_failed_result')::jsonb->'error'->>'code',
  'repository_removal_storage_failed',
  'a mid-transaction database failure returns the stable retryable code'
);
select results_eq(
  $$
    select project_record.repository_data_state,
      count(commit_record.id)::bigint
    from public.projects project_record
    left join public.github_commits commit_record
      on commit_record.project_id = project_record.id
    where project_record.id = current_setting('test.phase6_rollback_project')::uuid
    group by project_record.repository_data_state
  $$,
  $$values ('connected'::text, 1::bigint)$$,
  'failure rolls back both the write fence and prior deletion steps'
);

drop trigger github_commits_test_phase6_delete_failure on public.github_commits;
drop function app_private.test_phase6_force_delete_failure();

select set_config(
  'test.phase6_retry_result',
  public.execute_repository_removal(
    'a1000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_rollback_project')::uuid,
    'REMOVE_REPOSITORY_DATA', 'phase6-rollback-operation',
    current_setting('test.phase6_rollback_project')::uuid,
    'REMOVE ' || current_setting('test.phase6_rollback_project')
  )::text, true
);
select is(
  current_setting('test.phase6_retry_result')::jsonb->>'status',
  'completed', 'the same failed operation safely retries to completion'
);
select is(
  current_setting('test.phase6_retry_result')::jsonb->>'operationId',
  current_setting('test.phase6_failed_result')::jsonb->>'operationId',
  'failure retry reuses the original minimal operation tombstone'
);
select is(
  (select count(*) from public.github_commits
    where project_id = current_setting('test.phase6_rollback_project')::uuid),
  0::bigint, 'successful retry removes the previously rolled-back row exactly once'
);

select * from finish();
rollback;
