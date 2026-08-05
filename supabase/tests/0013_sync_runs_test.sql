begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'sync_runs', 'sync_runs exists');
select has_column('public', 'sync_runs', 'project_id', 'sync_runs belongs to a Project');
select has_column('public', 'sync_runs', 'idempotency_key', 'sync_runs carries an idempotency key');
select has_column('public', 'sync_runs', 'version', 'sync_runs carries an optimistic concurrency version');

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.sync_runs'::regclass
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid)
        = 'UNIQUE (project_id, idempotency_key)'
  $$,
  array[1::bigint],
  'idempotency is unique inside a Project'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.sync_runs'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.projects'::regclass
      and constraint_record.confdeltype = 'c'
  $$,
  array[1::bigint],
  'Project deletion cascades to SyncRun'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.sync_runs'::regclass),
  'sync_runs enables RLS'
);

select policies_are(
  'public',
  'sync_runs',
  array['sync_runs_select_own'],
  'sync_runs has only the owner read policy'
);

select indexes_are(
  'public',
  'sync_runs',
  array[
    'sync_runs_pkey',
    'sync_runs_project_idempotency_key',
    'sync_runs_project_created_idx',
    'sync_runs_project_active_updated_idx'
  ],
  'sync_runs has only primary, idempotency, latest and active indexes'
);

select ok(
  has_table_privilege('authenticated', 'public.sync_runs', 'select'),
  'authenticated can select through RLS'
);
select ok(
  not has_table_privilege('anon', 'public.sync_runs', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.sync_runs', 'insert,update,delete')
  and not has_table_privilege('service_role', 'public.sync_runs', 'insert,update,delete'),
  'browser and service roles have no direct SyncRun writes'
);

select ok(
  has_function_privilege('service_role', 'public.create_sync_run(uuid,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.get_latest_sync_run(uuid)', 'execute')
  and has_function_privilege(
    'service_role',
    'public.transition_sync_run(uuid,uuid,text,bigint,text,timestamptz,text,text,text)',
    'execute'
  ),
  'service_role receives only controlled SyncRun RPC execution'
);
select ok(
  not has_function_privilege('anon', 'public.create_sync_run(uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_sync_run(uuid,text,text)', 'execute')
  and not has_function_privilege(
    'authenticated',
    'public.transition_sync_run(uuid,uuid,text,bigint,text,timestamptz,text,text,text)',
    'execute'
  ),
  'browser roles cannot call controlled write RPCs'
);

select results_eq(
  $$
    select count(*)::bigint
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'sync_runs'
      and column_record.column_name
        ~* 'token|secret|authorization_header|raw_payload|raw_response|github_payload|freshness_status'
  $$,
  array[0::bigint],
  'SyncRun stores neither secrets/raw payloads nor derived Freshness'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'a7200000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'task2-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b7200000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'task2-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('a7200000-0000-4000-8000-000000000001'),
  ('b7200000-0000-4000-8000-000000000002');

insert into public.github_identities (user_id, github_user_id, github_login) values
  ('a7200000-0000-4000-8000-000000000001', 10720001, 'task2-user-a'),
  ('b7200000-0000-4000-8000-000000000002', 10720002, 'task2-user-b');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'a7210000-0000-4000-8000-000000000001',
    'a7200000-0000-4000-8000-000000000001',
    10721001, 10720001, 'task2-user-a', 'User', 'selected', 'active', now()
  ),
  (
    'b7210000-0000-4000-8000-000000000002',
    'b7200000-0000-4000-8000-000000000002',
    10721002, 10720002, 'task2-user-b', 'User', 'selected', 'active', now()
  );

insert into public.selected_repositories (
  id, user_id, github_installation_id, github_repository_id,
  owner_login, name, full_name, visibility, is_private, is_fork,
  is_archived, is_disabled, default_branch
) values
  (
    'a7220000-0000-4000-8000-000000000001',
    'a7200000-0000-4000-8000-000000000001',
    'a7210000-0000-4000-8000-000000000001',
    10722001, 'task2-user-a', 'alpha', 'task2-user-a/alpha',
    'private', true, false, false, false, 'main'
  ),
  (
    'a7220000-0000-4000-8000-000000000002',
    'a7200000-0000-4000-8000-000000000001',
    'a7210000-0000-4000-8000-000000000001',
    10722002, 'task2-user-a', 'beta', 'task2-user-a/beta',
    'private', true, false, false, false, 'main'
  ),
  (
    'b7220000-0000-4000-8000-000000000003',
    'b7200000-0000-4000-8000-000000000002',
    'b7210000-0000-4000-8000-000000000002',
    10722003, 'task2-user-b', 'gamma', 'task2-user-b/gamma',
    'private', true, false, false, false, 'main'
  );

insert into public.projects (
  id, user_id, selected_repository_id, core_goal,
  current_stage_goal, status
) values
  (
    'a7230000-0000-4000-8000-000000000001',
    'a7200000-0000-4000-8000-000000000001',
    'a7220000-0000-4000-8000-000000000001',
    'Synthetic Task 2 A1', 'Persist SyncRun', 'in_development'
  ),
  (
    'a7230000-0000-4000-8000-000000000002',
    'a7200000-0000-4000-8000-000000000001',
    'a7220000-0000-4000-8000-000000000002',
    'Synthetic Task 2 A2', 'Persist SyncRun', 'in_development'
  ),
  (
    'b7230000-0000-4000-8000-000000000003',
    'b7200000-0000-4000-8000-000000000002',
    'b7220000-0000-4000-8000-000000000003',
    'Synthetic Task 2 B', 'Persist SyncRun', 'in_development'
  );

select is(
  public.create_sync_run(
    'a7230000-0000-4000-8000-000000000001',
    'fixture-idempotency',
    'first_sync'
  )->>'status',
  'queued',
  'controlled creation starts queued'
);

select is(
  public.create_sync_run(
    'a7230000-0000-4000-8000-000000000001',
    'fixture-idempotency',
    'first_sync'
  )->>'id',
  (
    select id::text from public.sync_runs
    where project_id = 'a7230000-0000-4000-8000-000000000001'
      and idempotency_key = 'fixture-idempotency'
  ),
  'repeated project-scoped creation returns the same run'
);

select isnt(
  public.create_sync_run(
    'a7230000-0000-4000-8000-000000000002',
    'fixture-idempotency',
    'first_sync'
  )->>'id',
  (
    select id::text from public.sync_runs
    where project_id = 'a7230000-0000-4000-8000-000000000001'
      and idempotency_key = 'fixture-idempotency'
  ),
  'the same idempotency key is independent across Projects'
);

select throws_ok(
  $$ select public.create_sync_run(
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'missing-project', 'first_sync'
  ) $$,
  'P0002',
  'sync_run_project_not_found',
  'creation rejects an unknown Project'
);

select throws_ok(
  $$ select public.create_sync_run(
    'a7230000-0000-4000-8000-000000000001', ' ', 'first_sync'
  ) $$,
  'P0001',
  'sync_run_invalid_request',
  'creation rejects a blank idempotency key'
);

create temporary table sync_transition_cases (
  run_id uuid primary key,
  current_status text not null,
  target_status text not null
) on commit drop;

insert into sync_transition_cases (run_id, current_status, target_status) values
  ('c7240000-0000-4000-8000-000000000001', 'queued', 'running'),
  ('c7240000-0000-4000-8000-000000000002', 'queued', 'cancelled'),
  ('c7240000-0000-4000-8000-000000000003', 'queued', 'failed'),
  ('c7240000-0000-4000-8000-000000000004', 'running', 'partial'),
  ('c7240000-0000-4000-8000-000000000005', 'running', 'completed'),
  ('c7240000-0000-4000-8000-000000000006', 'running', 'failed'),
  ('c7240000-0000-4000-8000-000000000007', 'running', 'cancelled'),
  ('c7240000-0000-4000-8000-000000000008', 'partial', 'running'),
  ('c7240000-0000-4000-8000-000000000009', 'partial', 'completed'),
  ('c7240000-0000-4000-8000-000000000010', 'partial', 'failed'),
  ('c7240000-0000-4000-8000-000000000011', 'partial', 'cancelled');

insert into public.sync_runs (
  id, project_id, idempotency_key, trigger_source, status, version,
  queued_at, started_at, created_at, updated_at
)
select
  run_id,
  'a7230000-0000-4000-8000-000000000001',
  'transition:' || run_id::text,
  'fixture',
  current_status,
  1,
  '2026-08-05T10:00:00Z',
  case when current_status in ('running', 'partial')
    then '2026-08-05T10:01:00Z'::timestamptz else null end,
  '2026-08-05T10:00:00Z',
  '2026-08-05T10:00:00Z'
from sync_transition_cases;

select lives_ok(
  format(
    'select public.transition_sync_run(%L,%L,%L,1,%L,%L,null,%L,null)',
    'a7230000-0000-4000-8000-000000000001',
    run_id,
    current_status,
    target_status,
    '2026-08-05T10:02:00Z',
    case when target_status = 'failed' then 'fixture_failure' else null end
  ),
  format('%s -> %s succeeds atomically', current_status, target_status)
)
from sync_transition_cases
order by run_id;

select results_eq(
  $$
    select count(*)::bigint
    from public.sync_runs run_record
    join sync_transition_cases transition_record
      on transition_record.run_id = run_record.id
    where run_record.status = transition_record.target_status
      and run_record.version = 2
  $$,
  array[11::bigint],
  'all allowed transitions update status and version once'
);

insert into public.sync_runs (
  id, project_id, idempotency_key, trigger_source, status, version,
  queued_at, started_at, finished_at, created_at, updated_at
) values (
  'd7240000-0000-4000-8000-000000000001',
  'a7230000-0000-4000-8000-000000000001',
  'same-state-completed', 'fixture', 'completed', 5,
  '2026-08-05T09:00:00Z', '2026-08-05T09:01:00Z',
  '2026-08-05T09:02:00Z', '2026-08-05T09:00:00Z', '2026-08-05T09:02:00Z'
);

select is(
  public.transition_sync_run(
    'a7230000-0000-4000-8000-000000000001',
    'd7240000-0000-4000-8000-000000000001',
    'completed', 5, 'completed', '2026-08-05T11:00:00Z',
    null, null, null
  )->>'version',
  '5',
  'same-state replay is an unchanged no-op'
);

select throws_ok(
  $$ select public.transition_sync_run(
    'a7230000-0000-4000-8000-000000000001',
    'd7240000-0000-4000-8000-000000000001',
    'completed', 5, 'running', '2026-08-05T11:00:00Z',
    null, null, null
  ) $$,
  'P0001', 'sync_run_invalid_transition',
  'terminal completed cannot return to running'
);

select results_eq(
  $$ select status, version from public.sync_runs
     where id = 'd7240000-0000-4000-8000-000000000001' $$,
  $$ values ('completed'::text, 5::bigint) $$,
  'an illegal transition leaves the record unchanged'
);

select throws_ok(
  $$ select public.transition_sync_run(
    'a7230000-0000-4000-8000-000000000001',
    'c7240000-0000-4000-8000-000000000001',
    'running', 1, 'completed', '2026-08-05T11:00:00Z',
    null, null, null
  ) $$,
  'P0001', 'sync_run_concurrency_conflict',
  'a stale expected version cannot overwrite a concurrent transition'
);

select throws_ok(
  $$ select public.transition_sync_run(
    'b7230000-0000-4000-8000-000000000003',
    'c7240000-0000-4000-8000-000000000001',
    'running', 2, 'completed', '2026-08-05T11:00:00Z',
    null, null, null
  ) $$,
  'P0002', 'sync_run_not_found',
  'a cross-Project transition is rejected as not found'
);

select is(
  public.get_latest_sync_run('a7230000-0000-4000-8000-000000000002')->>'project_id',
  'a7230000-0000-4000-8000-000000000002',
  'latest-run read remains scoped to one Project'
);

insert into public.sync_runs (
  project_id, idempotency_key, trigger_source
) values (
  'b7230000-0000-4000-8000-000000000003', 'user-b-run', 'fixture'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a7200000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$ select count(*)::bigint from public.sync_runs
     where project_id = 'b7230000-0000-4000-8000-000000000003' $$,
  array[0::bigint],
  'user A cannot read user B SyncRuns'
);
select ok(
  (select count(*) > 0 from public.sync_runs),
  'user A can read SyncRuns owned through user A Projects'
);
select throws_ok(
  $$ insert into public.sync_runs (
    project_id, idempotency_key, trigger_source
  ) values (
    'a7230000-0000-4000-8000-000000000001', 'forged-browser-run', 'browser'
  ) $$,
  '42501', null,
  'authenticated cannot insert SyncRuns directly'
);

reset role;

delete from public.projects
where id = 'a7230000-0000-4000-8000-000000000002';

select results_eq(
  $$ select count(*)::bigint from public.sync_runs
     where project_id = 'a7230000-0000-4000-8000-000000000002' $$,
  array[0::bigint],
  'SyncRuns cascade when their Project is deleted'
);

select * from finish();
rollback;
