create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f9000000-0000-4000-8000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'phase7-concurrency@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.users (id) values ('f9000000-0000-4000-8000-000000000003');
insert into public.github_identities (user_id, github_user_id, github_login)
values ('f9000000-0000-4000-8000-000000000003', 999003, 'phase7-concurrency');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'f9100000-0000-4000-8000-000000000003',
  'f9000000-0000-4000-8000-000000000003',
  1000003, 999003, 'phase7-concurrency', 'User', 'selected', 'active', now()
);
select public.ensure_selected_github_repository(
  'f9000000-0000-4000-8000-000000000003',
  'f9100000-0000-4000-8000-000000000003',
  1001003, 'phase7-concurrency', 'gamma', 'phase7-concurrency/gamma',
  'private', true, false, false, false, 'main'
);
select public.save_project_calibration(
  'f9000000-0000-4000-8000-000000000003',
  (select id from public.selected_repositories where github_repository_id = 1001003),
  'Concurrent Phase 7', 'One durable owner', 'in_development', null
);
insert into public.energy_ledger_entries (
  user_id, business_date, idempotency_key, entry_type, amount, delta
) values (
  'f9000000-0000-4000-8000-000000000003',
  date '2026-08-18', 'daily-grant:phase7-concurrency', 'grant', 3, 3
);

select set_config(
  'request.jwt.claims',
  '{"sub":"f9000000-0000-4000-8000-000000000003","role":"authenticated"}',
  false
);
select public.reserve_energy(
  (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000003'),
  date '2026-08-18', 'brief:phase7:concurrent', 3
);

create function public.test_phase7_concurrent_payload(p_project_id uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'promptVersion', 'project-brief-v1',
    'schemaVersion', 'project-brief-schema-v1',
    'projectId', p_project_id,
    'evidenceFingerprint', repeat('d', 64),
    'rangeStart', '2026-08-01T00:00:00.000Z',
    'rangeEnd', '2026-08-18T00:00:00.000Z',
    'officialStatus', '{}'::jsonb,
    'summary', '{}'::jsonb,
    'completedChanges', '[]'::jsonb,
    'ongoingWork', '[]'::jsonb,
    'openItems', '[]'::jsonb,
    'riskSignals', '[]'::jsonb,
    'unknowns', '[]'::jsonb,
    'evidenceRefs', '[{"sourceKind":"project_profile"}]'::jsonb,
    'freshness', '{}'::jsonb,
    'boundaryNote',
      'This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility.'
  );
$$;

create function app_private.test_finalize_phase7_with_delay(
  p_reservation_id uuid,
  p_project_id uuid,
  p_delay_seconds double precision
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result_value jsonb;
begin
  result_value := public.finalize_project_brief_generation(
    'f9000000-0000-4000-8000-000000000003',
    p_reservation_id,
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v1', 'project-brief-schema-v1', repeat('d', 64),
    public.test_phase7_concurrent_payload(p_project_id),
    '2026-08-20T00:00:00Z', 'synthetic', 'fixture-v1',
    'request-concurrent', 10, 20, 30
  );
  perform pg_catalog.pg_sleep(p_delay_seconds);
  return result_value;
end;
$$;

create function app_private.test_phase7_dblink_connect(
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
alter function app_private.test_phase7_dblink_connect(text, text) owner to postgres;

select app_private.test_phase7_dblink_connect(
  'phase7_c1',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);
select app_private.test_phase7_dblink_connect(
  'phase7_c2',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);

select is(
  extensions.dblink_send_query(
    'phase7_c1',
    format(
      $query$
        select app_private.test_finalize_phase7_with_delay(%L::uuid, %L::uuid, 1.0)
        from (select set_config(
          'request.jwt.claims',
          '{"sub":"f9000000-0000-4000-8000-000000000003","role":"authenticated"}',
          false
        )) configured
      $query$,
      (select id from public.energy_reservations where request_key = 'brief:phase7:concurrent'),
      (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000003')
    )
  ),
  1,
  'first finalization is dispatched on an independent database session'
);
select pg_catalog.pg_sleep(0.2);
select is(
  extensions.dblink_send_query(
    'phase7_c2',
    format(
      $query$
        select public.finalize_project_brief_generation(
          'f9000000-0000-4000-8000-000000000003', %L::uuid,
          '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
          'project-brief-v1', 'project-brief-schema-v1', %L,
          public.test_phase7_concurrent_payload(%L::uuid),
          '2026-08-20T00:00:00Z', 'synthetic', 'fixture-v1',
          'request-concurrent', 10, 20, 30
        )
        from (select set_config(
          'request.jwt.claims',
          '{"sub":"f9000000-0000-4000-8000-000000000003","role":"authenticated"}',
          false
        )) configured
      $query$,
      (select id from public.energy_reservations where request_key = 'brief:phase7:concurrent'),
      repeat('d', 64),
      (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000003')
    )
  ),
  1,
  'second finalization competes while the first transaction owns the reservation lock'
);

create temporary table phase7_concurrency_results (
  connection_name text primary key,
  result jsonb
);
insert into phase7_concurrency_results
select 'phase7_c1', result
from extensions.dblink_get_result('phase7_c1') as remote_result(result jsonb);
insert into phase7_concurrency_results
select 'phase7_c2', result
from extensions.dblink_get_result('phase7_c2') as remote_result(result jsonb);

select results_eq(
  $$select result ->> 'outcome' from phase7_concurrency_results order by connection_name$$,
  $$values ('completed'::text), ('replayed'::text)$$,
  'concurrent finalizers elect exactly one creator and one durable replay'
);
select results_eq(
  $$select
      (select count(*) from public.project_briefs where evidence_fingerprint = repeat('d', 64))::bigint,
      (select count(*) from public.ai_invocations where reservation_id =
        (select id from public.energy_reservations where request_key = 'brief:phase7:concurrent'))::bigint,
      (select count(*) from public.energy_ledger_entries where entry_type = 'consumed'
        and reservation_id = (select id from public.energy_reservations where request_key = 'brief:phase7:concurrent'))::bigint$$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'concurrent replay leaves exactly one Brief, Invocation and consumed ledger fact'
);
select results_eq(
  $$select app_private.available_energy(
    'f9000000-0000-4000-8000-000000000003', date '2026-08-18'
  )$$,
  array[0::bigint],
  'concurrent finalization charges exactly three points once'
);

select extensions.dblink_disconnect('phase7_c1');
select extensions.dblink_disconnect('phase7_c2');
select app_private.test_phase7_dblink_connect(
  'phase7_c1',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);
select app_private.test_phase7_dblink_connect(
  'phase7_c2',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);

insert into public.energy_ledger_entries (
  user_id, business_date, idempotency_key, entry_type, amount, delta
) values (
  'f9000000-0000-4000-8000-000000000003',
  date '2026-08-18', 'daily-grant:phase7-lock-order', 'grant', 3, 3
);
select public.reserve_energy(
  (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000003'),
  date '2026-08-18', 'brief:phase7:lock-order', 3
);

create function app_private.test_hold_phase7_day_lock_then_reserve(
  p_project_id uuid,
  p_request_key text,
  p_delay_seconds double precision
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'f9000000-0000-4000-8000-000000000003:2026-08-18', 29
    )
  );
  perform pg_catalog.pg_sleep(p_delay_seconds);
  return public.reserve_energy(
    p_project_id, date '2026-08-18', p_request_key, 3
  );
end;
$$;

select is(
  extensions.dblink_send_query(
    'phase7_c1',
    format(
      $query$
        select app_private.test_hold_phase7_day_lock_then_reserve(
          %L::uuid, 'brief:phase7:lock-order', 1.0
        )
        from (select set_config(
          'request.jwt.claims',
          '{"sub":"f9000000-0000-4000-8000-000000000003","role":"authenticated"}',
          false
        )) configured
      $query$,
      (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000003')
    )
  ),
  1,
  'reserve replay holds the daily advisory lock before touching the reservation row'
);
select pg_catalog.pg_sleep(0.2);
select is(
  extensions.dblink_send_query(
    'phase7_c2',
    format(
      $query$
        select public.fail_project_brief_generation(
          'f9000000-0000-4000-8000-000000000003', %L::uuid,
          'provider', 'project_brief_provider_failure',
          'synthetic', 'fixture-v1', 'request-lock-order', null, null, 5
        )
      $query$,
      (select id from public.energy_reservations where request_key = 'brief:phase7:lock-order')
    )
  ),
  1,
  'failure release waits for the same advisory lock without first holding the row lock'
);

create temporary table phase7_lock_order_results (
  connection_name text primary key,
  result jsonb
);
insert into phase7_lock_order_results
select 'phase7_c1', result
from extensions.dblink_get_result('phase7_c1') as remote_result(result jsonb);
insert into phase7_lock_order_results
select 'phase7_c2', result
from extensions.dblink_get_result('phase7_c2') as remote_result(result jsonb);

select results_eq(
  $$select result ->> 'outcome' from phase7_lock_order_results order by connection_name$$,
  $$values ('replayed'::text), ('released'::text)$$,
  'reserve replay and failure release complete without deadlock'
);
select results_eq(
  $$select
      (select count(*) from public.energy_reservations
       where request_key = 'brief:phase7:lock-order' and status = 'released')::bigint,
      (select count(*) from public.energy_ledger_entries
       where reservation_id = (
         select id from public.energy_reservations where request_key = 'brief:phase7:lock-order'
       ) and entry_type = 'released')::bigint$$,
  $$values (1::bigint, 1::bigint)$$,
  'lock-order race ends with one terminal release and one refund fact'
);

drop function app_private.test_hold_phase7_day_lock_then_reserve(uuid, text, double precision);

select extensions.dblink_disconnect('phase7_c1');
select extensions.dblink_disconnect('phase7_c2');
drop function app_private.test_finalize_phase7_with_delay(uuid, uuid, double precision);
drop function app_private.test_phase7_dblink_connect(text, text);
drop function public.test_phase7_concurrent_payload(uuid);

alter table public.energy_ledger_entries disable trigger energy_ledger_entries_immutable;
delete from public.energy_ledger_entries
where user_id = 'f9000000-0000-4000-8000-000000000003';
alter table public.energy_ledger_entries enable trigger energy_ledger_entries_immutable;
delete from auth.users where id = 'f9000000-0000-4000-8000-000000000003';
drop extension dblink;

select * from finish();
