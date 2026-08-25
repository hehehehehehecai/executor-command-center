begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Phase 1.1 uses a fully independent synthetic lineage. Fixed operation IDs
-- make the sequence auditable without relying on execution order.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'b3000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase6-1-sequence-owner@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase6-1-sequence-other@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('b3000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002');

insert into public.github_identities (user_id, github_user_id, github_login) values
  ('b3000000-0000-4000-8000-000000000001', 631001, 'phase6-1-sequence-owner'),
  ('b3000000-0000-4000-8000-000000000002', 631002, 'phase6-1-sequence-other');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'b3100000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    632001, 631001, 'phase6-1-sequence-owner',
    'User', 'selected', 'active', now()
  ),
  (
    'b3100000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000002',
    632002, 631002, 'phase6-1-sequence-other',
    'User', 'selected', 'active', now()
  );

insert into public.selected_repositories (
  id, user_id, github_installation_id, github_repository_id,
  owner_login, name, full_name, visibility, is_private, is_fork,
  is_archived, is_disabled, default_branch
) values
  (
    'b3200000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b3100000-0000-4000-8000-000000000001', 633001,
    'phase6-1-sequence-owner', 'sequence-target',
    'phase6-1-sequence-owner/sequence-target',
    'private', true, false, false, false, 'main'
  ),
  (
    'b3200000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000001',
    'b3100000-0000-4000-8000-000000000001', 633002,
    'phase6-1-sequence-owner', 'owner-control',
    'phase6-1-sequence-owner/owner-control',
    'private', true, false, false, false, 'main'
  ),
  (
    'b3200000-0000-4000-8000-000000000003',
    'b3000000-0000-4000-8000-000000000002',
    'b3100000-0000-4000-8000-000000000002', 633003,
    'phase6-1-sequence-other', 'other-control',
    'phase6-1-sequence-other/other-control',
    'private', true, false, false, false, 'main'
  );

insert into public.projects (
  id, user_id, selected_repository_id, core_goal, current_stage_goal, status
) values
  (
    'b3300000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000001',
    'b3200000-0000-4000-8000-000000000001',
    'Phase 1.1 sequence target', 'Remove then delete', 'in_development'
  ),
  (
    'b3300000-0000-4000-8000-000000000002',
    'b3000000-0000-4000-8000-000000000001',
    'b3200000-0000-4000-8000-000000000002',
    'Phase 1.1 owner control', 'Must remain unchanged', 'in_development'
  ),
  (
    'b3300000-0000-4000-8000-000000000003',
    'b3000000-0000-4000-8000-000000000002',
    'b3200000-0000-4000-8000-000000000003',
    'Phase 1.1 other control', 'Must remain unchanged', 'in_development'
  );

insert into public.github_commits (
  project_id, github_object_id, source_updated_at, source_version,
  message, committed_at
) values
  (
    'b3300000-0000-4000-8000-000000000001',
    'phase6-1-sequence-source-id', now(), 'sequence-v1',
    'Synthetic sequence target', now()
  ),
  (
    'b3300000-0000-4000-8000-000000000002',
    'phase6-1-owner-control-source', now(), 'owner-control-v1',
    'Synthetic owner boundary control', now()
  ),
  (
    'b3300000-0000-4000-8000-000000000003',
    'phase6-1-other-control-source', now(), 'other-control-v1',
    'Synthetic cross-user boundary control', now()
  );

insert into public.project_briefs (
  id, user_id, project_id, range_start, range_end, prompt_version,
  schema_version, evidence_fingerprint, status, payload, completed_at
) values (
  'b3400000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b3300000-0000-4000-8000-000000000001',
  now() - interval '2 days', now() - interval '1 day',
  'phase6-1-sequence-v1', 'phase6-1-schema-v1', repeat('e', 64),
  'completed',
  jsonb_build_object(
    'evidenceRefs', jsonb_build_array(jsonb_build_object(
      'contractVersion', 'project-brief-evidence-source-ref.v1',
      'sourceKind', 'github_commit',
      'sourceId', 'phase6-1-sequence-source-id',
      'sourceVersion', 'sequence-v1',
      'projectId', 'b3300000-0000-4000-8000-000000000001'
    ))
  ), now()
);

insert into public.energy_reservations (
  id, user_id, project_id, business_date, request_key, amount
) values (
  'b3600000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001',
  'b3300000-0000-4000-8000-000000000001',
  date '2026-08-25', 'phase6-1-sequence-reservation', 7
);

insert into public.energy_ledger_entries (
  user_id, project_id, business_date, idempotency_key,
  entry_type, amount, delta, reservation_id
) values (
  'b3000000-0000-4000-8000-000000000001',
  'b3300000-0000-4000-8000-000000000001',
  date '2026-08-25', 'phase6-1-sequence-reserved',
  'reserved', 7, -7, 'b3600000-0000-4000-8000-000000000001'
);

create function app_private.test_phase6_1_assign_operation_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.idempotency_key = 'phase6-1-sequence-remove' then
    new.id := 'b3500000-0000-4000-8000-000000000001';
  elsif new.idempotency_key = 'phase6-1-sequence-delete' then
    new.id := 'b3500000-0000-4000-8000-000000000002';
  end if;
  return new;
end;
$$;

create trigger repository_removal_operations_phase6_1_assign_id
before insert on public.repository_removal_operations
for each row execute function app_private.test_phase6_1_assign_operation_id();

select set_config(
  'test.phase6_1_remove_result',
  public.execute_repository_removal(
    'b3000000-0000-4000-8000-000000000001',
    'b3300000-0000-4000-8000-000000000001',
    'REMOVE_REPOSITORY_DATA', 'phase6-1-sequence-remove',
    'b3300000-0000-4000-8000-000000000001',
    'REMOVE b3300000-0000-4000-8000-000000000001'
  )::text, true
);

select is(
  current_setting('test.phase6_1_remove_result')::jsonb->>'status',
  'completed', 'sequence step 1 removes repository data'
);
select is(
  (select repository_data_state from public.projects
    where id = 'b3300000-0000-4000-8000-000000000001'),
  'removed', 'sequence step 1 leaves the disabled project shell'
);
select is(
  (select count(*) from public.evidence_reference_invalidations
    where target_project_id = 'b3300000-0000-4000-8000-000000000001'
      and source_id = 'phase6-1-sequence-source-id'),
  1::bigint, 'sequence step 1 invalidates the synthetic Evidence Link'
);

select is(
  public.execute_repository_removal(
    'b3000000-0000-4000-8000-000000000001',
    'b3300000-0000-4000-8000-000000000001',
    'DELETE_PROJECT_SUBTREE', 'phase6-1-sequence-remove',
    'b3300000-0000-4000-8000-000000000001',
    'DELETE b3300000-0000-4000-8000-000000000001'
  )->'error'->>'code',
  'repository_removal_conflict',
  'same idempotency key with different parameters still fails closed'
);

select set_config(
  'test.phase6_1_delete_result',
  public.execute_repository_removal(
    'b3000000-0000-4000-8000-000000000001',
    'b3300000-0000-4000-8000-000000000001',
    'DELETE_PROJECT_SUBTREE', 'phase6-1-sequence-delete',
    'b3300000-0000-4000-8000-000000000001',
    'DELETE b3300000-0000-4000-8000-000000000001'
  )::text, true
);

select is(
  current_setting('test.phase6_1_delete_result')::jsonb->>'status',
  'completed', 'sequence step 2 deletes the removed project with a new key'
);
select is(
  current_setting('test.phase6_1_delete_result')::jsonb->>'operationId',
  'b3500000-0000-4000-8000-000000000002',
  'DELETE result is bound to the fixed sequence operation ID'
);
select is(
  (select count(*) from public.projects
    where id = 'b3300000-0000-4000-8000-000000000001'),
  0::bigint, 'sequence upgrade leaves no target project row'
);
select is(
  (select count(*) from public.evidence_reference_invalidations
    where target_project_id = 'b3300000-0000-4000-8000-000000000001'),
  0::bigint, 'project deletion removes prior Evidence invalidation rows'
);
select is(
  (select count(*) from public.evidence_reference_invalidations
    where source_id = 'phase6-1-sequence-source-id'),
  0::bigint, 'project deletion leaves no Evidence source identifier'
);
select is(
  (select count(*) from public.repository_removal_operations
    where user_id = 'b3000000-0000-4000-8000-000000000001'
      and target_project_id = 'b3300000-0000-4000-8000-000000000001'
      and status = 'completed'),
  2::bigint, 'REMOVE and DELETE retain two minimal completed tombstones'
);
select is(
  (select count(*) from public.repository_removal_operations
    where user_id = 'b3000000-0000-4000-8000-000000000001'
      and result::text like '%phase6-1-sequence-source-id%'),
  0::bigint, 'operation tombstones do not copy the removed source identifier'
);

select set_config(
  'test.phase6_1_delete_replay_result',
  public.execute_repository_removal(
    'b3000000-0000-4000-8000-000000000001',
    'b3300000-0000-4000-8000-000000000001',
    'DELETE_PROJECT_SUBTREE', 'phase6-1-sequence-delete',
    'b3300000-0000-4000-8000-000000000001',
    'DELETE b3300000-0000-4000-8000-000000000001'
  )::text, true
);

select is(
  current_setting('test.phase6_1_delete_replay_result')::jsonb->>'operationId',
  current_setting('test.phase6_1_delete_result')::jsonb->>'operationId',
  'DELETE replay returns the original completed operation'
);
select is(
  current_setting('test.phase6_1_delete_replay_result')::jsonb->>'outcome',
  'replayed', 'DELETE replay reports no second execution'
);
select is(
  (select count(*) from public.repository_removal_operations
    where user_id = 'b3000000-0000-4000-8000-000000000001'
      and target_project_id = 'b3300000-0000-4000-8000-000000000001'),
  2::bigint, 'DELETE replay creates no duplicate tombstone'
);

select results_eq(
  $$
    select count(*)::bigint,
      count(*) filter (where project_id is null and reservation_id is null)::bigint,
      coalesce(sum(delta), 0)::bigint
    from public.energy_ledger_entries
    where repository_removal_operation_id =
      'b3500000-0000-4000-8000-000000000001'
  $$,
  $$values (2::bigint, 2::bigint, 0::bigint)$$,
  'account ledger rows remain detached, preserved and balance-neutral'
);
select is(
  (select count(*) from public.projects
    where id in (
      'b3300000-0000-4000-8000-000000000002',
      'b3300000-0000-4000-8000-000000000003'
    )),
  2::bigint, 'owner-control and cross-user projects remain unchanged'
);
select is(
  (select count(*) from public.github_commits
    where github_object_id in (
      'phase6-1-owner-control-source',
      'phase6-1-other-control-source'
    )),
  2::bigint, 'owner-control and cross-user source rows remain unchanged'
);

drop trigger repository_removal_operations_phase6_1_assign_id
on public.repository_removal_operations;
drop function app_private.test_phase6_1_assign_operation_id();

select * from finish();
rollback;
