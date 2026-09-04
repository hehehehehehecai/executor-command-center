create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f9000000-0000-4000-8000-000000000006',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'daily-grant-concurrency@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.users (id)
values ('f9000000-0000-4000-8000-000000000006');

insert into public.github_identities (user_id, github_user_id, github_login)
values ('f9000000-0000-4000-8000-000000000006', 996006, 'daily-grant-concurrency');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'f9100000-0000-4000-8000-000000000006',
  'f9000000-0000-4000-8000-000000000006',
  997006, 996006, 'daily-grant-concurrency', 'User', 'selected', 'active', now()
);

select public.ensure_selected_github_repository(
  'f9000000-0000-4000-8000-000000000006',
  'f9100000-0000-4000-8000-000000000006',
  998006, 'daily-grant-concurrency', 'gamma', 'daily-grant-concurrency/gamma',
  'private', true, false, false, false, 'main'
);

select public.save_project_calibration(
  'f9000000-0000-4000-8000-000000000006',
  (select id from public.selected_repositories where github_repository_id = 998006),
  'Daily grant concurrency', 'Phase 10.3', 'in_development', null
);

create function app_private.test_daily_grant_reserve_with_delay(
  p_project_id uuid,
  p_request_key text,
  p_delay_seconds double precision
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result_value jsonb;
begin
  result_value := public.reserve_project_brief_energy(p_project_id, p_request_key);
  perform pg_catalog.pg_sleep(p_delay_seconds);
  return result_value;
end;
$$;

create function app_private.test_daily_grant_dblink_connect(
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

alter function app_private.test_daily_grant_dblink_connect(text, text) owner to postgres;

select app_private.test_daily_grant_dblink_connect(
  'daily_grant_c1',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);
select app_private.test_daily_grant_dblink_connect(
  'daily_grant_c2',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);

select is(
  extensions.dblink_send_query(
    'daily_grant_c1',
    format(
      $query$
        select app_private.test_daily_grant_reserve_with_delay(
          %L::uuid, 'brief:daily:concurrent', 1.0
        )
        from (
          select set_config(
            'request.jwt.claims',
            '{"sub":"f9000000-0000-4000-8000-000000000006","role":"authenticated"}',
            false
          )
        ) configured
      $query$,
      (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000006')
    )
  ),
  1,
  'first daily grant and reserve is dispatched on an independent session'
);

select pg_catalog.pg_sleep(0.2);

select is(
  extensions.dblink_send_query(
    'daily_grant_c2',
    format(
      $query$
        select public.reserve_project_brief_energy(
          %L::uuid, 'brief:daily:concurrent'
        )
        from (
          select set_config(
            'request.jwt.claims',
            '{"sub":"f9000000-0000-4000-8000-000000000006","role":"authenticated"}',
            false
          )
        ) configured
      $query$,
      (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000006')
    )
  ),
  1,
  'concurrent replay is dispatched while the shared user/day lock is held'
);

create temporary table daily_grant_concurrency_results (
  connection_name text primary key,
  result jsonb
);

insert into daily_grant_concurrency_results (connection_name, result)
select 'daily_grant_c1', result
from extensions.dblink_get_result('daily_grant_c1') as remote_result(result jsonb);

insert into daily_grant_concurrency_results (connection_name, result)
select 'daily_grant_c2', result
from extensions.dblink_get_result('daily_grant_c2') as remote_result(result jsonb);

select results_eq(
  $$select result ->> 'outcome' from daily_grant_concurrency_results order by connection_name$$,
  $$values ('reserved'), ('replayed')$$,
  'one concurrent caller owns the reservation and the other gets its durable replay'
);

select results_eq(
  $$
    select
      count(*) filter (where entry_type = 'grant')::bigint,
      count(*) filter (where entry_type = 'reserved')::bigint,
      sum(delta)::bigint
    from public.energy_ledger_entries
    where user_id = 'f9000000-0000-4000-8000-000000000006'
      and business_date = (clock_timestamp() at time zone 'UTC')::date
  $$,
  $$values (1::bigint, 1::bigint, 7::bigint)$$,
  'concurrent calls commit one grant, one reservation and a non-negative balance'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.energy_reservations
    where user_id = 'f9000000-0000-4000-8000-000000000006'
      and request_key = 'brief:daily:concurrent'
  $$,
  array[1::bigint],
  'concurrent idempotent requests persist one reservation'
);

select extensions.dblink_disconnect('daily_grant_c1');
select extensions.dblink_disconnect('daily_grant_c2');
drop function app_private.test_daily_grant_reserve_with_delay(uuid, text, double precision);
drop function app_private.test_daily_grant_dblink_connect(text, text);

alter table public.energy_ledger_entries disable trigger energy_ledger_entries_immutable;
delete from public.energy_ledger_entries
where user_id = 'f9000000-0000-4000-8000-000000000006';
alter table public.energy_ledger_entries enable trigger energy_ledger_entries_immutable;
delete from auth.users where id = 'f9000000-0000-4000-8000-000000000006';
drop extension dblink;

select * from finish();
