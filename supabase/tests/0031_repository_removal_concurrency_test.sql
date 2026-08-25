create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a2000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'phase6-concurrency@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.users (id)
values ('a2000000-0000-4000-8000-000000000001');
insert into public.github_identities (user_id, github_user_id, github_login)
values ('a2000000-0000-4000-8000-000000000001', 620001, 'phase6-concurrency');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'a2100000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  621001, 620001, 'phase6-concurrency', 'User', 'selected', 'active', now()
);

select public.ensure_selected_github_repository(
  'a2000000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000001',
  622001, 'phase6-concurrency', 'double-click',
  'phase6-concurrency/double-click',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'a2000000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000001',
  622002, 'phase6-concurrency', 'mode-race',
  'phase6-concurrency/mode-race',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'a2000000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000001',
  622003, 'phase6-concurrency', 'retry-conflict',
  'phase6-concurrency/retry-conflict',
  'private', true, false, false, false, 'main'
);
select public.save_project_calibration(
  'a2000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 622001),
  'Concurrent double click', 'Exactly one removal', 'in_development', null
);
select public.save_project_calibration(
  'a2000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 622002),
  'Concurrent modes', 'Exactly one mode wins', 'in_development', null
);
select public.save_project_calibration(
  'a2000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 622003),
  'Retry conflict', 'Retry fails closed behind an active operation',
  'in_development', null
);

select set_config(
  'test.phase6_double_click_project',
  (select id::text from public.projects where core_goal = 'Concurrent double click'), false
);
select set_config(
  'test.phase6_mode_race_project',
  (select id::text from public.projects where core_goal = 'Concurrent modes'), false
);
select set_config(
  'test.phase6_retry_conflict_project',
  (select id::text from public.projects where core_goal = 'Retry conflict'), false
);

insert into public.github_commits (
  project_id, github_object_id, source_updated_at, source_version,
  message, committed_at
) values
  (
    current_setting('test.phase6_double_click_project')::uuid,
    'double-click-sha', now(), 'double-click-v1', 'Synthetic concurrent row', now()
  ),
  (
    current_setting('test.phase6_mode_race_project')::uuid,
    'mode-race-sha', now(), 'mode-race-v1', 'Synthetic competing row', now()
  );

create function app_private.test_phase6_removal_with_lock_delay(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_mode text,
  p_idempotency_key text,
  p_confirmation_text text,
  p_lock_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lock_kind = 'idempotency' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_actor_user_id::text || ':' || p_idempotency_key, 61
      )
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_project_id::text, 62)
    );
  end if;
  perform pg_catalog.pg_sleep(1.0);
  return public.execute_repository_removal(
    p_actor_user_id, p_project_id, p_mode, p_idempotency_key,
    p_project_id, p_confirmation_text
  );
end;
$$;

create function app_private.test_phase6_dblink_connect(
  p_connection_name text,
  p_connection_string text
)
returns text
language sql
security definer
set search_path = ''
as $$
  select extensions.dblink_connect(p_connection_name, p_connection_string);
$$;

alter function app_private.test_phase6_removal_with_lock_delay(
  uuid, uuid, text, text, text, text
) owner to postgres;
alter function app_private.test_phase6_dblink_connect(text, text) owner to postgres;

select app_private.test_phase6_dblink_connect(
  'phase6_removal_c1',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);
select app_private.test_phase6_dblink_connect(
  'phase6_removal_c2',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);

select is(
  extensions.dblink_send_query(
    'phase6_removal_c1',
    format(
      $query$
        select app_private.test_phase6_removal_with_lock_delay(
          'a2000000-0000-4000-8000-000000000001', %L::uuid,
          'REMOVE_REPOSITORY_DATA', 'phase6-concurrent-same-key',
          %L, 'idempotency'
        )
      $query$,
      current_setting('test.phase6_double_click_project'),
      'REMOVE ' || current_setting('test.phase6_double_click_project')
    )
  ),
  1, 'first identical request holds the idempotency transaction lock'
);
select pg_catalog.pg_sleep(0.2);
select is(
  extensions.dblink_send_query(
    'phase6_removal_c2',
    format(
      $query$
        select public.execute_repository_removal(
          'a2000000-0000-4000-8000-000000000001', %L::uuid,
          'REMOVE_REPOSITORY_DATA', 'phase6-concurrent-same-key',
          %L::uuid, %L
        )
      $query$,
      current_setting('test.phase6_double_click_project'),
      current_setting('test.phase6_double_click_project'),
      'REMOVE ' || current_setting('test.phase6_double_click_project')
    )
  ),
  1, 'second identical request is dispatched while the first holds the lock'
);

create temporary table phase6_same_key_results (
  connection_name text primary key,
  result jsonb not null
);
insert into phase6_same_key_results
select 'phase6_removal_c1', result
from extensions.dblink_get_result('phase6_removal_c1') as remote_result(result jsonb);
insert into phase6_same_key_results
select 'phase6_removal_c2', result
from extensions.dblink_get_result('phase6_removal_c2') as remote_result(result jsonb);
select *
from extensions.dblink_get_result('phase6_removal_c1') as remote_result(result jsonb);
select *
from extensions.dblink_get_result('phase6_removal_c2') as remote_result(result jsonb);

select results_eq(
  $$
    select count(*) filter (where result->>'outcome' = 'executed')::bigint,
      count(*) filter (where result->>'outcome' = 'replayed')::bigint,
      count(distinct result->>'operationId')::bigint
    from phase6_same_key_results
  $$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'concurrent double click executes once and returns one stable operation'
);
select is(
  (select count(*) from public.github_commits
    where project_id = current_setting('test.phase6_double_click_project')::uuid),
  0::bigint, 'concurrent replay leaves no duplicate or residual derived row'
);

create function app_private.test_phase6_delay_operation_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.idempotency_key = 'phase6-mode-race-remove' then
    perform pg_catalog.pg_sleep(1.0);
  end if;
  return new;
end;
$$;
create trigger repository_removal_operations_test_delay
after insert on public.repository_removal_operations
for each row execute function app_private.test_phase6_delay_operation_insert();

select is(
  extensions.dblink_send_query(
    'phase6_removal_c1',
    format(
      $query$
        select public.execute_repository_removal(
          'a2000000-0000-4000-8000-000000000001', %L::uuid,
          'REMOVE_REPOSITORY_DATA', 'phase6-mode-race-remove',
          %L::uuid, %L
        )
      $query$,
      current_setting('test.phase6_mode_race_project'),
      current_setting('test.phase6_mode_race_project'),
      'REMOVE ' || current_setting('test.phase6_mode_race_project')
    )
  ),
  1, 'repository-data mode holds the project removal lock'
);
select pg_catalog.pg_sleep(0.2);
select is(
  extensions.dblink_send_query(
    'phase6_removal_c2',
    format(
      $query$
        select public.execute_repository_removal(
          'a2000000-0000-4000-8000-000000000001', %L::uuid,
          'DELETE_PROJECT_SUBTREE', 'phase6-mode-race-delete',
          %L::uuid, %L
        )
      $query$,
      current_setting('test.phase6_mode_race_project'),
      current_setting('test.phase6_mode_race_project'),
      'DELETE ' || current_setting('test.phase6_mode_race_project')
    )
  ),
  1, 'competing project-delete mode is dispatched concurrently'
);

create temporary table phase6_mode_race_results (
  connection_name text primary key,
  result jsonb
);
insert into phase6_mode_race_results
select 'phase6_removal_c1', result
from extensions.dblink_get_result('phase6_removal_c1') as remote_result(result jsonb);
insert into phase6_mode_race_results
select 'phase6_removal_c2', result
from extensions.dblink_get_result('phase6_removal_c2') as remote_result(result jsonb);

select results_eq(
  $$
    select count(*) filter (where result->>'status' = 'completed')::bigint,
      count(*) filter (
        where result->'error'->>'code' = 'repository_removal_conflict'
      )::bigint
    from phase6_mode_race_results
  $$,
  $$values (1::bigint, 1::bigint)$$,
  'different modes produce one winner and one stable conflict'
);
select is(
  (select count(*) from public.github_commits
    where project_id = current_setting('test.phase6_mode_race_project')::uuid),
  0::bigint, 'the winning mode disposes the target exactly once'
);

insert into public.repository_removal_operations (
  id, user_id, target_project_id, mode, idempotency_key,
  request_fingerprint, status, failure_stage, error_code,
  safely_retryable, completed_at
) values (
  'a2300000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  current_setting('test.phase6_retry_conflict_project')::uuid,
  'REMOVE_REPOSITORY_DATA', 'phase6-retry-conflict',
  encode(
    extensions.digest(
      convert_to(
        'a2000000-0000-4000-8000-000000000001' || chr(31)
          || current_setting('test.phase6_retry_conflict_project') || chr(31)
          || 'REMOVE_REPOSITORY_DATA' || chr(31)
          || current_setting('test.phase6_retry_conflict_project') || chr(31)
          || 'REMOVE ' || current_setting('test.phase6_retry_conflict_project'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'failed', 'storage', 'repository_removal_storage_failure',
  true, now()
), (
  'a2300000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000001',
  current_setting('test.phase6_retry_conflict_project')::uuid,
  'DELETE_PROJECT_SUBTREE', 'phase6-active-blocker',
  repeat('b', 64), 'executing', null, null, true, null
);

select is(
  public.execute_repository_removal(
    'a2000000-0000-4000-8000-000000000001',
    current_setting('test.phase6_retry_conflict_project')::uuid,
    'REMOVE_REPOSITORY_DATA', 'phase6-retry-conflict',
    current_setting('test.phase6_retry_conflict_project')::uuid,
    'REMOVE ' || current_setting('test.phase6_retry_conflict_project')
  )->'error'->>'code',
  'repository_removal_conflict',
  'retry behind another active operation returns the stable conflict code'
);
select results_eq(
  $$
    select status, failure_stage, error_code
    from public.repository_removal_operations
    where id = 'a2300000-0000-4000-8000-000000000001'
  $$,
  $$values (
    'failed'::text, 'storage'::text,
    'repository_removal_storage_failure'::text
  )$$,
  'retry conflict preserves the prior failure for a later safe retry'
);

select extensions.dblink_disconnect('phase6_removal_c1');
select extensions.dblink_disconnect('phase6_removal_c2');
drop trigger repository_removal_operations_test_delay
on public.repository_removal_operations;
drop function app_private.test_phase6_delay_operation_insert();
drop function app_private.test_phase6_removal_with_lock_delay(
  uuid, uuid, text, text, text, text
);
drop function app_private.test_phase6_dblink_connect(text, text);

delete from public.projects
where user_id = 'a2000000-0000-4000-8000-000000000001';
delete from public.repository_removal_operations
where user_id = 'a2000000-0000-4000-8000-000000000001';
delete from auth.users
where id = 'a2000000-0000-4000-8000-000000000001';

select * from finish();
