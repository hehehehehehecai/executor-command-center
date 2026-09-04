begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- This rolled-back transaction validates the legacy Phase 7 primitive directly.
-- Production authenticated callers use reserve_project_brief_energy.
grant execute on function public.reserve_energy(uuid, date, text, integer) to authenticated;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'd9000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e9000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase7-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('d9000000-0000-4000-8000-000000000001'),
  ('e9000000-0000-4000-8000-000000000002');

insert into public.github_identities (user_id, github_user_id, github_login) values
  ('d9000000-0000-4000-8000-000000000001', 996001, 'phase7-a'),
  ('e9000000-0000-4000-8000-000000000002', 996002, 'phase7-b');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'd9100000-0000-4000-8000-000000000001',
    'd9000000-0000-4000-8000-000000000001',
    997001, 996001, 'phase7-a', 'User', 'selected', 'active', now()
  ),
  (
    'e9100000-0000-4000-8000-000000000002',
    'e9000000-0000-4000-8000-000000000002',
    997002, 996002, 'phase7-b', 'User', 'selected', 'active', now()
  );

select public.ensure_selected_github_repository(
  'd9000000-0000-4000-8000-000000000001',
  'd9100000-0000-4000-8000-000000000001',
  998001, 'phase7-a', 'alpha', 'phase7-a/alpha',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'e9000000-0000-4000-8000-000000000002',
  'e9100000-0000-4000-8000-000000000002',
  998002, 'phase7-b', 'beta', 'phase7-b/beta',
  'private', true, false, false, false, 'main'
);

select public.save_project_calibration(
  'd9000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 998001),
  'Phase 7 generation', 'Validated Brief', 'in_development', null
);
select public.save_project_calibration(
  'e9000000-0000-4000-8000-000000000002',
  (select id from public.selected_repositories where github_repository_id = 998002),
  'Other Phase 7 generation', 'Isolation', 'in_development', null
);

insert into public.energy_ledger_entries (
  user_id, business_date, idempotency_key, entry_type, amount, delta
) values
  ('d9000000-0000-4000-8000-000000000001', date '2026-08-18', 'daily-grant:phase7-a', 'grant', 12, 12),
  ('e9000000-0000-4000-8000-000000000002', date '2026-08-18', 'daily-grant:phase7-b', 'grant', 3, 3);

create function public.test_phase7_payload(p_project_id uuid, p_fingerprint text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'promptVersion', 'project-brief-v1',
    'schemaVersion', 'project-brief-schema-v1',
    'projectId', p_project_id,
    'evidenceFingerprint', p_fingerprint,
    'rangeStart', '2026-08-01T00:00:00.000Z',
    'rangeEnd', '2026-08-18T00:00:00.000Z',
    'officialStatus', jsonb_build_object(
      'value', 'in_development',
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase7-profile',
        'projectId', p_project_id
      ))
    ),
    'summary', jsonb_build_object(
      'text', 'Synthetic database contract.',
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase7-profile',
        'projectId', p_project_id
      ))
    ),
    'completedChanges', '[]'::jsonb,
    'ongoingWork', '[]'::jsonb,
    'openItems', '[]'::jsonb,
    'riskSignals', '[]'::jsonb,
    'unknowns', '[]'::jsonb,
    'evidenceRefs', jsonb_build_array(jsonb_build_object(
      'contractVersion', 'project-brief-evidence-source-ref.v1',
      'sourceKind', 'project_profile', 'sourceId', 'phase7-profile',
      'projectId', p_project_id
    )),
    'freshness', jsonb_build_object(
      'status', 'fresh',
      'evaluatedAt', '2026-08-18T00:00:00.000Z',
      'lastSuccessfulAt', '2026-08-18T00:00:00.000Z',
      'coverageComplete', true,
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase7-profile',
        'projectId', p_project_id
      ))
    ),
    'boundaryNote',
      'This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility.'
  );
$$;

select set_config(
  'test.phase7_project_a',
  (select id::text from public.projects where user_id = 'd9000000-0000-4000-8000-000000000001'),
  true
);

select throws_ok(
  format(
    $$select public.finalize_project_brief_generation(
      null, null, '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
      'project-brief-v1', 'project-brief-schema-v1', %L,
      public.test_phase7_payload(%L::uuid, %L), pg_catalog.clock_timestamp() + interval '1 day',
      'synthetic', 'fixture-v1', 'request-unauthenticated', 1, 1, 1
    )$$,
    repeat('a', 64), current_setting('test.phase7_project_a'), repeat('a', 64)
  ),
  'P0001', 'project_brief_generation_unauthenticated',
  'finalization fails closed without auth.uid()'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.reserve_energy(
  current_setting('test.phase7_project_a')::uuid,
  date '2026-08-18', 'brief:phase7:success', 3
);
select set_config(
  'test.phase7_success_reservation',
  (select id::text from public.energy_reservations where request_key = 'brief:phase7:success'),
  true
);

select throws_ok(
  format(
    $$select public.finalize_project_brief_generation(
      'd9000000-0000-4000-8000-000000000001', %L::uuid,
      '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
      'project-brief-v1', 'project-brief-schema-v1', %L,
      '{"schemaVersion":"project-brief-schema-v1"}'::jsonb,
      pg_catalog.clock_timestamp() + interval '1 day', null, null, null, null, null, null
    )$$,
    current_setting('test.phase7_success_reservation'), repeat('a', 64)
  ),
  '42501', null,
  'authenticated clients cannot bypass validation through finalization'
);
reset role;

select results_eq(
  format(
    $$select result ->> 'outcome' from (
      select public.finalize_project_brief_generation(
        'd9000000-0000-4000-8000-000000000001', %L::uuid,
        '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
        'project-brief-v1', 'project-brief-schema-v1', %L,
        public.test_phase7_payload(%L::uuid, %L), pg_catalog.clock_timestamp() + interval '1 day',
        'synthetic', 'fixture-v1', 'request-success', 10, 20, 30
      ) result
    ) finalized$$,
    current_setting('test.phase7_success_reservation'), repeat('a', 64),
    current_setting('test.phase7_project_a'), repeat('a', 64)
  ),
  array['completed'],
  'validated Brief, Invocation and consume commit through one RPC'
);

select results_eq(
  $$select
      (select count(*) from public.project_briefs where status = 'completed')::bigint,
      (select count(*) from public.ai_invocations where status = 'completed')::bigint,
      (select count(*) from public.energy_ledger_entries where entry_type = 'consumed')::bigint,
      (select count(*) from public.energy_reservations where status = 'consumed')::bigint$$,
  $$values (1::bigint, 1::bigint, 1::bigint, 1::bigint)$$,
  'successful finalization leaves exactly one completed lineage and consumed fact'
);
select results_eq(
  $$select provider_request_id from public.ai_invocations where status = 'completed'$$,
  array['request-success'],
  'completed Invocation retains the safe provider request id'
);

select results_eq(
  format(
    $$select result ->> 'outcome' from (
      select public.finalize_project_brief_generation(
        'd9000000-0000-4000-8000-000000000001', %L::uuid,
        '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
        'project-brief-v1', 'project-brief-schema-v1', %L,
        public.test_phase7_payload(%L::uuid, %L), pg_catalog.clock_timestamp() + interval '1 day',
        'synthetic', 'fixture-v1', 'request-success', 10, 20, 30
      ) result
    ) replayed$$,
    current_setting('test.phase7_success_reservation'), repeat('a', 64),
    current_setting('test.phase7_project_a'), repeat('a', 64)
  ),
  array['replayed'],
  'same reservation and lineage replays without duplicate persistence or charge'
);

select results_eq(
  $$select
      (select count(*) from public.project_briefs)::bigint,
      (select count(*) from public.ai_invocations)::bigint,
      (select count(*) from public.energy_ledger_entries where entry_type = 'consumed')::bigint$$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'successful replay creates no duplicate Brief, Invocation or ledger fact'
);

select results_eq(
  format(
    $$select result ->> 'status' from (
      select public.get_project_brief_generation_outcome(%L::uuid) result
    ) durable$$,
    current_setting('test.phase7_success_reservation')
  ),
  array['completed'],
  'consumed replay has a durable completed outcome'
);

select public.reserve_energy(
  current_setting('test.phase7_project_a')::uuid,
  date '2026-08-18', 'brief:phase7:failure', 3
);
select set_config(
  'test.phase7_failure_reservation',
  (select id::text from public.energy_reservations where request_key = 'brief:phase7:failure'),
  true
);
select results_eq(
  format(
    $$select result ->> 'outcome' from (
      select public.fail_project_brief_generation(
        'd9000000-0000-4000-8000-000000000001', %L::uuid,
        'provider', 'project_brief_provider_failure',
        'synthetic', 'fixture-v1', 'request-failure', null, null, 5
      ) result
    ) failed$$,
    current_setting('test.phase7_failure_reservation')
  ),
  array['released'],
  'expected generation failure is recorded and released atomically'
);
select results_eq(
  $$select
      (select count(*) from public.energy_reservations
       where status = 'released' and failure_stage = 'provider')::bigint,
      (select count(*) from public.ai_invocations
       where status = 'failed' and failure_stage = 'provider')::bigint,
      (select count(*) from public.energy_ledger_entries
       where entry_type = 'released' and invocation_id is not null)::bigint$$,
  $$values (1::bigint, 1::bigint, 1::bigint)$$,
  'failure lineage, terminal reservation and refund fact are unique and linked'
);
select results_eq(
  $$select provider_request_id from public.ai_invocations where status = 'failed'$$,
  array['request-failure'],
  'failed Invocation retains the safe provider request id'
);
select results_eq(
  format(
    $$select result ->> 'outcome' from (
      select public.fail_project_brief_generation(
        'd9000000-0000-4000-8000-000000000001', %L::uuid,
        'provider', 'project_brief_provider_failure',
        'synthetic', 'fixture-v1', 'request-failure', null, null, 5
      ) result
    ) replayed$$,
    current_setting('test.phase7_failure_reservation')
  ),
  array['replayed'],
  'same durable failure replays without another refund'
);

select public.reserve_energy(
  current_setting('test.phase7_project_a')::uuid,
  date '2026-08-18', 'brief:phase7:rollback', 3
);
select set_config(
  'test.phase7_rollback_reservation',
  (select id::text from public.energy_reservations where request_key = 'brief:phase7:rollback'),
  true
);

reset role;
create function app_private.test_reject_phase7_consume()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.request_key = 'brief:phase7:rollback' and new.status = 'consumed' then
    raise exception using errcode = 'P0001', message = 'phase7_forced_consume_failure';
  end if;
  return new;
end;
$$;
create trigger test_reject_phase7_consume
before update on public.energy_reservations
for each row execute function app_private.test_reject_phase7_consume();

select throws_ok(
  format(
    $$select public.finalize_project_brief_generation(
      'd9000000-0000-4000-8000-000000000001', %L::uuid,
      '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
      'project-brief-v1', 'project-brief-schema-v1', %L,
      public.test_phase7_payload(%L::uuid, %L), pg_catalog.clock_timestamp() + interval '1 day',
      'synthetic', 'fixture-v1', 'request-rollback', 10, 20, 30
    )$$,
    current_setting('test.phase7_rollback_reservation'), repeat('c', 64),
    current_setting('test.phase7_project_a'), repeat('c', 64)
  ),
  'P0001', 'phase7_forced_consume_failure',
  'consume failure aborts the entire finalization transaction'
);
select results_eq(
  format(
    $$select
      (select count(*) from public.project_briefs where evidence_fingerprint = %L)::bigint,
      (select count(*) from public.ai_invocations where reservation_id = %L::uuid)::bigint,
      (select count(*) from public.energy_reservations where id = %L::uuid and status = 'reserved')::bigint$$,
    repeat('c', 64), current_setting('test.phase7_rollback_reservation'),
    current_setting('test.phase7_rollback_reservation')
  ),
  $$values (0::bigint, 0::bigint, 1::bigint)$$,
  'failed consume leaves no partial Completed Brief or Invocation'
);
reset role;
drop trigger test_reject_phase7_consume on public.energy_reservations;
drop function app_private.test_reject_phase7_consume();

select public.fail_project_brief_generation(
  'd9000000-0000-4000-8000-000000000001',
  current_setting('test.phase7_rollback_reservation')::uuid,
  'energy_consume', 'project_brief_energy_consume_failed',
  'synthetic', 'fixture-v1', 'request-rollback', 10, 20, 30
);

select throws_ok(
  format(
    $$select public.fail_project_brief_generation(
      'e9000000-0000-4000-8000-000000000002', %L::uuid,
      'provider', 'project_brief_provider_failure',
      null, null, null, null, null, null
    )$$,
    current_setting('test.phase7_failure_reservation')
  ),
  'P0001', 'project_brief_generation_reservation_not_found',
  'another user cannot release or mutate the first user reservation'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e9000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    $$select public.get_project_brief_generation_outcome(%L::uuid)$$,
    current_setting('test.phase7_success_reservation')
  ),
  'P0001', 'project_brief_generation_reservation_not_found',
  'another user cannot read the durable generation outcome'
);
select results_eq(
  $$select count(*)::bigint from public.project_briefs$$,
  array[0::bigint],
  'RLS exposes no first-user Brief to another authenticated user'
);
reset role;

drop function public.test_phase7_payload(uuid, text);

select * from finish();
rollback;
