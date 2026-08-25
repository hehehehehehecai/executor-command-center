create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b3000000-0000-4000-8000-000000000010',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'phase6-1-race@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.users (id)
values ('b3000000-0000-4000-8000-000000000010');
insert into public.github_identities (user_id, github_user_id, github_login)
values ('b3000000-0000-4000-8000-000000000010', 631010, 'phase6-1-race');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'b3100000-0000-4000-8000-000000000010',
  'b3000000-0000-4000-8000-000000000010',
  632010, 631010, 'phase6-1-race', 'User', 'selected', 'active', now()
);
insert into public.selected_repositories (
  id, user_id, github_installation_id, github_repository_id,
  owner_login, name, full_name, visibility, is_private, is_fork,
  is_archived, is_disabled, default_branch
) values (
  'b3200000-0000-4000-8000-000000000010',
  'b3000000-0000-4000-8000-000000000010',
  'b3100000-0000-4000-8000-000000000010', 633010,
  'phase6-1-race', 'mode-race', 'phase6-1-race/mode-race',
  'private', true, false, false, false, 'main'
);
insert into public.projects (
  id, user_id, selected_repository_id, core_goal, current_stage_goal, status
) values (
  'b3300000-0000-4000-8000-000000000010',
  'b3000000-0000-4000-8000-000000000010',
  'b3200000-0000-4000-8000-000000000010',
  'Phase 1.1 concurrent modes', 'Exactly one mode wins', 'in_development'
);
insert into public.github_commits (
  project_id, github_object_id, source_updated_at, source_version,
  message, committed_at
) values (
  'b3300000-0000-4000-8000-000000000010',
  'phase6-1-race-source', now(), 'race-v1',
  'Synthetic concurrent boundary row', now()
);

create function app_private.test_phase6_1_assign_race_operation_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.idempotency_key = 'phase6-1-race-remove' then
    new.id := 'b3500000-0000-4000-8000-000000000010';
  elsif new.idempotency_key = 'phase6-1-race-delete' then
    new.id := 'b3500000-0000-4000-8000-000000000011';
  end if;
  return new;
end;
$$;
create trigger repository_removal_operations_phase6_1_assign_race_id
before insert on public.repository_removal_operations
for each row execute function app_private.test_phase6_1_assign_race_operation_id();

create function app_private.test_phase6_1_delay_race_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.idempotency_key = 'phase6-1-race-remove' then
    perform pg_catalog.pg_sleep(1.0);
  end if;
  return new;
end;
$$;
create trigger repository_removal_operations_phase6_1_delay_race
after insert on public.repository_removal_operations
for each row execute function app_private.test_phase6_1_delay_race_insert();

create function app_private.test_phase6_1_dblink_connect(
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
alter function app_private.test_phase6_1_dblink_connect(text, text)
owner to postgres;

select app_private.test_phase6_1_dblink_connect(
  'phase6_1_race_c1',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);
select app_private.test_phase6_1_dblink_connect(
  'phase6_1_race_c2',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);

select is(
  extensions.dblink_send_query(
    'phase6_1_race_c1',
    $$
      select public.execute_repository_removal(
        'b3000000-0000-4000-8000-000000000010',
        'b3300000-0000-4000-8000-000000000010',
        'REMOVE_REPOSITORY_DATA', 'phase6-1-race-remove',
        'b3300000-0000-4000-8000-000000000010',
        'REMOVE b3300000-0000-4000-8000-000000000010'
      )
    $$
  ),
  1, 'repository-data removal is dispatched first'
);
select pg_catalog.pg_sleep(0.2);
select is(
  extensions.dblink_send_query(
    'phase6_1_race_c2',
    $$
      select public.execute_repository_removal(
        'b3000000-0000-4000-8000-000000000010',
        'b3300000-0000-4000-8000-000000000010',
        'DELETE_PROJECT_SUBTREE', 'phase6-1-race-delete',
        'b3300000-0000-4000-8000-000000000010',
        'DELETE b3300000-0000-4000-8000-000000000010'
      )
    $$
  ),
  1, 'project deletion is dispatched before the first request completes'
);

create temporary table phase6_1_race_results (
  connection_name text primary key,
  result jsonb not null
);
insert into phase6_1_race_results
select 'phase6_1_race_c1', result
from extensions.dblink_get_result('phase6_1_race_c1')
  as remote_result(result jsonb);
insert into phase6_1_race_results
select 'phase6_1_race_c2', result
from extensions.dblink_get_result('phase6_1_race_c2')
  as remote_result(result jsonb);

select results_eq(
  $$
    select count(*) filter (where result->>'status' = 'completed')::bigint,
      count(*) filter (
        where result->'error'->>'code' = 'repository_removal_conflict'
      )::bigint
    from phase6_1_race_results
  $$,
  $$values (1::bigint, 1::bigint)$$,
  'truly concurrent different modes retain one winner and one stable conflict'
);
select is(
  (select count(*) from public.repository_removal_operations
    where user_id = 'b3000000-0000-4000-8000-000000000010'
      and status = 'completed'),
  1::bigint, 'only one concurrent operation reaches completed state'
);
select is(
  (select count(*) from public.github_commits
    where project_id = 'b3300000-0000-4000-8000-000000000010'),
  0::bigint, 'the winning mode disposes the source row exactly once'
);

select extensions.dblink_disconnect('phase6_1_race_c1');
select extensions.dblink_disconnect('phase6_1_race_c2');

drop trigger repository_removal_operations_phase6_1_delay_race
on public.repository_removal_operations;
drop function app_private.test_phase6_1_delay_race_insert();
drop trigger repository_removal_operations_phase6_1_assign_race_id
on public.repository_removal_operations;
drop function app_private.test_phase6_1_assign_race_operation_id();
drop function app_private.test_phase6_1_dblink_connect(text, text);

delete from public.projects
where user_id = 'b3000000-0000-4000-8000-000000000010';
delete from public.repository_removal_operations
where user_id = 'b3000000-0000-4000-8000-000000000010';
delete from auth.users
where id = 'b3000000-0000-4000-8000-000000000010';

select * from finish();
