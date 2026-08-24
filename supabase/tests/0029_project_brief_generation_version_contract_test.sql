begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public', 'fail_project_brief_generation_with_contract',
  array[
    'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'text', 'text', 'integer', 'integer', 'integer'
  ],
  'version-aware failure finalization has one unambiguous RPC name'
);
select is(
  (
    select count(*)::integer
    from pg_proc procedure_record
    join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'fail_project_brief_generation_with_contract'
  ),
  1,
  'the version-aware failure RPC has no overload ambiguity'
);
select function_privs_are(
  'public', 'fail_project_brief_generation_with_contract',
  array[
    'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'text', 'text', 'integer', 'integer', 'integer'
  ],
  'service_role', array['EXECUTE'],
  'only service_role can execute the version-aware failure RPC'
);
select function_privs_are(
  'public', 'fail_project_brief_generation_with_contract',
  array[
    'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'text', 'text', 'integer', 'integer', 'integer'
  ],
  'authenticated', array[]::text[],
  'authenticated clients cannot execute the version-aware failure RPC'
);
select function_privs_are(
  'public', 'fail_project_brief_generation_with_contract',
  array[
    'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'text', 'text', 'integer', 'integer', 'integer'
  ],
  'anon', array[]::text[],
  'anonymous clients cannot execute the version-aware failure RPC'
);
select function_privs_are(
  'public', 'fail_project_brief_generation_with_contract',
  array[
    'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'text', 'text', 'integer', 'integer', 'integer'
  ],
  'public', array[]::text[],
  'PUBLIC has no implicit execute privilege on the version-aware failure RPC'
);
select results_eq(
  $$
    select pg_get_userbyid(procedure_record.proowner), procedure_record.prosecdef,
      procedure_record.proconfig[1]::text collate "default"
    from pg_proc procedure_record
    join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'fail_project_brief_generation_with_contract'
  $$,
  $$values ('postgres'::name, true, 'search_path=""'::text)$$,
  'the version-aware failure RPC is postgres-owned SECURITY DEFINER with empty search_path'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b6000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'phase10-6@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.users (id) values ('b6000000-0000-4000-8000-000000000001');
insert into public.github_identities (user_id, github_user_id, github_login)
values ('b6000000-0000-4000-8000-000000000001', 1006001, 'phase10-6');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'b6100000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  1006002, 1006001, 'phase10-6', 'User', 'selected', 'active', now()
);
select public.ensure_selected_github_repository(
  'b6000000-0000-4000-8000-000000000001',
  'b6100000-0000-4000-8000-000000000001',
  1006003, 'phase10-6', 'version-contract', 'phase10-6/version-contract',
  'private', true, false, false, false, 'main'
);
select public.save_project_calibration(
  'b6000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 1006003),
  'Phase 10.6', 'Cross-layer version contract', 'in_development', null
);
select set_config(
  'test.phase10_6_project',
  (select id::text from public.projects where user_id = 'b6000000-0000-4000-8000-000000000001'),
  true
);

create function public.test_phase10_6_payload(
  p_project_id uuid,
  p_fingerprint text,
  p_prompt_version text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'promptVersion', p_prompt_version,
    'schemaVersion', 'project-brief-schema-v1',
    'projectId', p_project_id,
    'evidenceFingerprint', p_fingerprint,
    'rangeStart', '2026-08-01T00:00:00.000Z',
    'rangeEnd', '2026-08-18T00:00:00.000Z',
    'officialStatus', jsonb_build_object(
      'value', 'in_development',
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
        'projectId', p_project_id
      ))
    ),
    'summary', jsonb_build_object(
      'text', 'Synthetic version contract.',
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
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
      'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
      'projectId', p_project_id
    )),
    'freshness', jsonb_build_object(
      'status', 'fresh',
      'evaluatedAt', '2026-08-18T00:00:00.000Z',
      'lastSuccessfulAt', '2026-08-18T00:00:00.000Z',
      'coverageComplete', true,
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
        'projectId', p_project_id
      ))
    ),
    'boundaryNote',
      'This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility.'
  );
$$;

insert into public.energy_reservations (
  id, user_id, project_id, business_date, request_key, amount, status
) values
  ('b6200000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', current_setting('test.phase10_6_project')::uuid, date '2026-08-24', 'phase10-6-finalize-v1', 3, 'reserved'),
  ('b6200000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', current_setting('test.phase10_6_project')::uuid, date '2026-08-24', 'phase10-6-finalize-v2', 3, 'reserved'),
  ('b6200000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000001', current_setting('test.phase10_6_project')::uuid, date '2026-08-24', 'phase10-6-finalize-invalid', 3, 'reserved'),
  ('b6200000-0000-4000-8000-000000000004', 'b6000000-0000-4000-8000-000000000001', current_setting('test.phase10_6_project')::uuid, date '2026-08-24', 'phase10-6-fail-v1', 3, 'reserved'),
  ('b6200000-0000-4000-8000-000000000005', 'b6000000-0000-4000-8000-000000000001', current_setting('test.phase10_6_project')::uuid, date '2026-08-24', 'phase10-6-fail-v2', 3, 'reserved'),
  ('b6200000-0000-4000-8000-000000000006', 'b6000000-0000-4000-8000-000000000001', current_setting('test.phase10_6_project')::uuid, date '2026-08-24', 'phase10-6-fail-invalid', 3, 'reserved');

select is(
  (public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000001',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v1', 'project-brief-schema-v1', repeat('a', 64), repeat('b', 64), repeat('c', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('a', 64), 'project-brief-v1'),
    pg_catalog.clock_timestamp() + interval '1 day', 'synthetic', 'fixture', 'v1-finalize', 1, 2, 3
  ) ->> 'outcome'),
  'completed',
  'v1 finalization remains compatible'
);
select is(
  (public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000001',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v1', 'project-brief-schema-v1', repeat('a', 64), repeat('b', 64), repeat('c', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('a', 64), 'project-brief-v1'),
    pg_catalog.clock_timestamp() + interval '1 day', 'synthetic', 'fixture', 'v1-finalize', 1, 2, 3
  ) ->> 'outcome'),
  'replayed',
  'v1 finalization replay remains idempotent'
);

select is(
  (public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000002',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v2', 'project-brief-schema-v1', repeat('d', 64), repeat('e', 64), repeat('f', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('d', 64), 'project-brief-v2'),
    pg_catalog.clock_timestamp() + interval '1 day', 'synthetic', 'fixture', 'v2-finalize', 4, 5, 6
  ) ->> 'outcome'),
  'completed',
  'v2 finalization completes through the current cache-equivalence wrapper'
);
select is(
  (public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000002',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v2', 'project-brief-schema-v1', repeat('d', 64), repeat('e', 64), repeat('f', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('d', 64), 'project-brief-v2'),
    pg_catalog.clock_timestamp() + interval '1 day', 'synthetic', 'fixture', 'v2-finalize', 4, 5, 6
  ) ->> 'outcome'),
  'replayed',
  'v2 finalization replay remains idempotent'
);
select results_eq(
  $$select prompt_version, schema_version from public.project_briefs where evidence_fingerprint = repeat('d', 64)$$,
  $$values ('project-brief-v2'::text, 'project-brief-schema-v1'::text)$$,
  'v2 Completed Brief stores the real contract versions'
);
select results_eq(
  $$select prompt_version, schema_version from public.ai_invocations where provider_request_id = 'v2-finalize'$$,
  $$values ('project-brief-v2'::text, 'project-brief-schema-v1'::text)$$,
  'v2 Completed Invocation stores the real contract versions'
);

select throws_ok(
  $$select public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000003',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v3', 'project-brief-schema-v1', repeat('1', 64), repeat('2', 64), repeat('3', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('1', 64), 'project-brief-v3'),
    pg_catalog.clock_timestamp() + interval '1 day', null, null, null, null, null, null
  )$$,
  'P0001', 'project_brief_generation_invalid_request',
  'unknown finalize prompt version fails closed'
);
select throws_ok(
  $$select public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000003',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v2', 'project-brief-schema-v2', repeat('1', 64), repeat('2', 64), repeat('3', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('1', 64), 'project-brief-v2'),
    pg_catalog.clock_timestamp() + interval '1 day', null, null, null, null, null, null
  )$$,
  'P0001', 'project_brief_generation_invalid_request',
  'unknown finalize schema version fails closed'
);
select throws_ok(
  $$select public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000003',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    null, 'project-brief-schema-v1', repeat('1', 64), repeat('2', 64), repeat('3', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('1', 64), 'project-brief-v2'),
    pg_catalog.clock_timestamp() + interval '1 day', null, null, null, null, null, null
  )$$,
  'P0001', 'project_brief_generation_invalid_request',
  'null finalize prompt version fails closed'
);
select results_eq(
  $$select
    (select count(*) from public.project_briefs where evidence_fingerprint = repeat('1', 64))::bigint,
    (select count(*) from public.ai_invocations where reservation_id = 'b6200000-0000-4000-8000-000000000003')::bigint,
    (select count(*) from public.energy_reservations where id = 'b6200000-0000-4000-8000-000000000003' and status = 'reserved')::bigint$$,
  $$values (0::bigint, 0::bigint, 1::bigint)$$,
  'invalid finalize versions leave no partial persistence or consume'
);

select is(
  (public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000004',
    'provider', 'project_brief_provider_failure', 'synthetic', 'fixture', 'v1-fail',
    'project-brief-v1', 'project-brief-schema-v1', repeat('4', 64), repeat('5', 64), 7, 8, 9
  ) ->> 'outcome'),
  'released',
  'the new failure RPC preserves v1 rolling compatibility'
);
select is(
  (public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000005',
    'schema_validation', 'project_brief_schema_validation_failed', 'synthetic', 'fixture', 'v2-fail',
    'project-brief-v2', 'project-brief-schema-v1', repeat('6', 64), repeat('7', 64), 10, 11, 12
  ) ->> 'outcome'),
  'released',
  'the new failure RPC atomically records and releases v2 failures'
);
select is(
  (public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000005',
    'schema_validation', 'project_brief_schema_validation_failed', 'synthetic', 'fixture', 'v2-fail',
    'project-brief-v2', 'project-brief-schema-v1', repeat('6', 64), repeat('7', 64), 10, 11, 12
  ) ->> 'outcome'),
  'replayed',
  'the same v2 failure replays without another refund'
);
select throws_ok(
  $$select public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000005',
    'schema_validation', 'project_brief_schema_validation_failed', 'synthetic', 'fixture', 'changed-request',
    'project-brief-v2', 'project-brief-schema-v1', repeat('6', 64), repeat('7', 64), 10, 11, 12
  )$$,
  'P0001', 'project_brief_generation_idempotency_conflict',
  'a replay with changed safe metadata fails closed'
);
select results_eq(
  $$select prompt_version, schema_version, input_fingerprint, cache_equivalence_fingerprint
    from public.ai_invocations where provider_request_id = 'v2-fail'$$,
  $$values ('project-brief-v2'::text, 'project-brief-schema-v1'::text, repeat('6', 64), repeat('7', 64))$$,
  'failed v2 Invocation stores the real versions and fingerprints'
);
select throws_ok(
  $$select public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000006',
    'provider', 'project_brief_provider_failure', null, null, null,
    'project-brief-v3', 'project-brief-schema-v1', repeat('8', 64), repeat('9', 64), null, null, null
  )$$,
  'P0001', 'project_brief_generation_invalid_request',
  'unknown failure prompt version fails closed'
);
select throws_ok(
  $$select public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000006',
    'provider', 'project_brief_provider_failure', null, null, null,
    'project-brief-v2', null, repeat('8', 64), repeat('9', 64), null, null, null
  )$$,
  'P0001', 'project_brief_generation_invalid_request',
  'null failure schema version fails closed'
);
select results_eq(
  $$select
    (select count(*) from public.ai_invocations where reservation_id = 'b6200000-0000-4000-8000-000000000006')::bigint,
    (select count(*) from public.energy_ledger_entries where reservation_id = 'b6200000-0000-4000-8000-000000000006')::bigint,
    (select count(*) from public.energy_reservations where id = 'b6200000-0000-4000-8000-000000000006' and status = 'reserved')::bigint$$,
  $$values (0::bigint, 0::bigint, 1::bigint)$$,
  'invalid failure versions leave no Invocation, release ledger or state transition'
);
select throws_ok(
  $$select public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000002',
    'provider', 'project_brief_provider_failure', null, null, null,
    'project-brief-v2', 'project-brief-schema-v1', repeat('d', 64), repeat('e', 64), null, null, null
  )$$,
  'P0001', 'project_brief_generation_idempotency_conflict',
  'a consumed reservation cannot cross into the failure terminal state'
);
select throws_ok(
  $$select public.fail_project_brief_generation_with_contract(
    'b6000000-0000-4000-8000-000000000099', 'b6200000-0000-4000-8000-000000000006',
    'provider', 'project_brief_provider_failure', null, null, null,
    'project-brief-v2', 'project-brief-schema-v1', repeat('8', 64), repeat('9', 64), null, null, null
  )$$,
  'P0001', 'project_brief_generation_reservation_not_found',
  'a different actor cannot release another user reservation'
);
select throws_ok(
  $$select public.finalize_project_brief_generation(
    'b6000000-0000-4000-8000-000000000001', 'b6200000-0000-4000-8000-000000000005',
    '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
    'project-brief-v2', 'project-brief-schema-v1', repeat('6', 64), repeat('7', 64), repeat('0', 64),
    public.test_phase10_6_payload(current_setting('test.phase10_6_project')::uuid, repeat('6', 64), 'project-brief-v2'),
    pg_catalog.clock_timestamp() + interval '1 day', null, null, null, null, null, null
  )$$,
  'P0001', 'project_brief_generation_idempotency_conflict',
  'a released reservation cannot cross into the completed terminal state'
);

drop function public.test_phase10_6_payload(uuid, text, text);
select * from finish();
rollback;
