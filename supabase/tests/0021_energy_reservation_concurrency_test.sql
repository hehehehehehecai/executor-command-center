create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'c9000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'energy-concurrency@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.users (id)
values ('c9000000-0000-4000-8000-000000000003');

insert into public.github_identities (user_id, github_user_id, github_login)
values ('c9000000-0000-4000-8000-000000000003', 993003, 'energy-concurrency');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'c9100000-0000-4000-8000-000000000003',
  'c9000000-0000-4000-8000-000000000003',
  994003, 993003, 'energy-concurrency', 'User', 'selected', 'active', now()
);

select public.ensure_selected_github_repository(
  'c9000000-0000-4000-8000-000000000003',
  'c9100000-0000-4000-8000-000000000003',
  995003, 'energy-concurrency', 'gamma', 'energy-concurrency/gamma',
  'private', true, false, false, false, 'main'
);

select public.save_project_calibration(
  'c9000000-0000-4000-8000-000000000003',
  (select id from public.selected_repositories where github_repository_id = 995003),
  'Concurrent accounting', 'Phase 1', 'in_development', null
);

insert into public.energy_ledger_entries (
  user_id, business_date, idempotency_key, entry_type, amount, delta
) values (
  'c9000000-0000-4000-8000-000000000003',
  date '2026-08-18', 'daily-grant:concurrency', 'grant', 5, 5
);

create function app_private.test_reserve_energy_with_delay(
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
  result_value := public.reserve_energy(
    p_project_id,
    date '2026-08-18',
    p_request_key,
    3
  );
  perform pg_catalog.pg_sleep(p_delay_seconds);
  return result_value;
end;
$$;

create function app_private.test_dblink_connect(
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

alter function app_private.test_dblink_connect(text, text) owner to postgres;

select app_private.test_dblink_connect(
  'energy_c1',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);
select app_private.test_dblink_connect(
  'energy_c2',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);

select is(
  extensions.dblink_send_query(
    'energy_c1',
    format(
      $query$
        select app_private.test_reserve_energy_with_delay(
          %L::uuid, 'concurrent:first', 1.0
        )
        from (
          select set_config(
            'request.jwt.claims',
            '{"sub":"c9000000-0000-4000-8000-000000000003","role":"authenticated"}',
            false
          )
        ) configured
      $query$,
      (select id from public.projects where user_id = 'c9000000-0000-4000-8000-000000000003')
    )
  ),
  1,
  'first reservation is dispatched on an independent database session'
);

select pg_catalog.pg_sleep(0.2);

select is(
  extensions.dblink_send_query(
    'energy_c2',
    format(
      $query$
        select public.reserve_energy(
          %L::uuid, date '2026-08-18', 'concurrent:second', 3
        )
        from (
          select set_config(
            'request.jwt.claims',
            '{"sub":"c9000000-0000-4000-8000-000000000003","role":"authenticated"}',
            false
          )
        ) configured
      $query$,
      (select id from public.projects where user_id = 'c9000000-0000-4000-8000-000000000003')
    )
  ),
  1,
  'second reservation is dispatched while the first transaction holds the daily lock'
);

create temporary table energy_concurrency_results (
  connection_name text primary key,
  result jsonb
);

insert into energy_concurrency_results (connection_name, result)
select 'energy_c1', result
from extensions.dblink_get_result('energy_c1') as remote_result(result jsonb);

select *
from extensions.dblink_get_result('energy_c2', false) as remote_result(result jsonb);

select results_eq(
  $$select result ->> 'outcome' from energy_concurrency_results where connection_name = 'energy_c1'$$,
  array['reserved'],
  'first concurrent transaction reserves the available energy'
);
select ok(
  extensions.dblink_error_message('energy_c2') like '%energy_insufficient_balance%',
  'second concurrent transaction fails with the stable insufficient balance semantic'
);
select results_eq(
  $$
    select
      count(*)::bigint,
      count(*) filter (where status = 'reserved')::bigint
    from public.energy_reservations
    where user_id = 'c9000000-0000-4000-8000-000000000003'
      and business_date = date '2026-08-18'
  $$,
  $$values (1::bigint, 1::bigint)$$,
  'exactly one reservation commits when the grant can satisfy only one request'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.energy_ledger_entries
    where user_id = 'c9000000-0000-4000-8000-000000000003'
      and business_date = date '2026-08-18'
      and entry_type = 'reserved'
  $$,
  array[1::bigint],
  'the losing transaction creates no reservation ledger fact'
);
select results_eq(
  $$select app_private.available_energy(
    'c9000000-0000-4000-8000-000000000003', date '2026-08-18'
  )$$,
  array[2::bigint],
  'final concurrent balance is non-negative and equals grant minus one winner'
);

select extensions.dblink_disconnect('energy_c1');
select extensions.dblink_disconnect('energy_c2');
drop function app_private.test_reserve_energy_with_delay(uuid, text, double precision);
drop function app_private.test_dblink_connect(text, text);

alter table public.energy_ledger_entries disable trigger energy_ledger_entries_immutable;
delete from public.energy_ledger_entries
where user_id = 'c9000000-0000-4000-8000-000000000003';
alter table public.energy_ledger_entries enable trigger energy_ledger_entries_immutable;
delete from auth.users where id = 'c9000000-0000-4000-8000-000000000003';
drop extension dblink;

select * from finish();
