begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column(
  'public', 'project_briefs', 'cache_equivalence_fingerprint',
  'Briefs persist stable cache equivalence separately from full Evidence'
);
select has_column(
  'public', 'ai_invocations', 'cache_equivalence_fingerprint',
  'Invocations persist the cache equivalence lineage'
);
select has_column(
  'public', 'ai_invocations', 'source_invocation_id',
  'Cache-hit observations point to the original Provider invocation'
);
select has_column(
  'public', 'project_briefs', 'payload_fingerprint',
  'Brief cache rows retain an independent payload integrity fingerprint'
);
select has_function(
  'public', 'record_project_brief_cache_hit',
  array['uuid', 'uuid', 'text', 'text', 'timestamp with time zone']
);
select function_privs_are(
  'public', 'record_project_brief_cache_hit',
  array['uuid', 'uuid', 'text', 'text', 'timestamp with time zone'],
  'service_role', array['EXECUTE']
);
select function_privs_are(
  'public', 'record_project_brief_cache_hit',
  array['uuid', 'uuid', 'text', 'text', 'timestamp with time zone'],
  'authenticated', array[]::text[]
);
select function_privs_are(
  'public', 'record_project_brief_cache_hit',
  array['uuid', 'uuid', 'text', 'text', 'timestamp with time zone'],
  'anon', array[]::text[],
  'anonymous clients cannot execute the cache-hit observation RPC'
);
select function_privs_are(
  'public', 'record_project_brief_cache_hit',
  array['uuid', 'uuid', 'text', 'text', 'timestamp with time zone'],
  'public', array[]::text[],
  'PUBLIC has no implicit execute privilege on the cache-hit observation RPC'
);
select is(
  (
    select count(*)::integer
    from pg_proc procedure_record
    join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'record_project_brief_cache_hit'
  ),
  1,
  'the cache-hit observation RPC keeps one unambiguous signature'
);
select results_eq(
  $$
    select pg_get_userbyid(procedure_record.proowner), procedure_record.prosecdef,
      procedure_record.proconfig[1]::text collate "default"
    from pg_proc procedure_record
    join pg_namespace namespace_record on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'record_project_brief_cache_hit'
  $$,
  $$values ('postgres'::name, true, 'search_path=""'::text)$$,
  'the cache-hit observation RPC is postgres-owned SECURITY DEFINER with empty search_path'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'fa000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'phase10-1-cache@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.users (id) values ('fa000000-0000-4000-8000-000000000001');
insert into public.github_identities (user_id, github_user_id, github_login)
values ('fa000000-0000-4000-8000-000000000001', 999401, 'phase10-1-cache');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'fa100000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  999402, 999401, 'phase10-1-cache', 'User', 'selected', 'active', now()
);
select public.ensure_selected_github_repository(
  'fa000000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  999403, 'phase10-1-cache', 'cache', 'phase10-1-cache/cache',
  'private', true, false, false, false, 'main'
);
select public.save_project_calibration(
  'fa000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 999403),
  'Phase 10.1 cache', 'Stable equivalence', 'in_development', null
);
insert into public.energy_reservations (
  id, user_id, project_id, business_date, request_key, amount, status
) values (
  'fa200000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  (select id from public.projects where user_id = 'fa000000-0000-4000-8000-000000000001'),
  date '2026-08-21', 'phase10-1-cache', 3, 'reserved'
);

select set_config(
  'test.phase10_1_project',
  (select id::text from public.projects where user_id = 'fa000000-0000-4000-8000-000000000001'),
  true
);

create function public.test_phase10_1_payload(p_project_id uuid, p_fingerprint text)
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
        'sourceKind', 'project_profile', 'sourceId', 'phase10-1-profile',
        'projectId', p_project_id
      ))
    ),
    'summary', jsonb_build_object(
      'text', 'Synthetic stable cache equivalence.',
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-1-profile',
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
      'sourceKind', 'project_profile', 'sourceId', 'phase10-1-profile',
      'projectId', p_project_id
    )),
    'freshness', jsonb_build_object(
      'status', 'fresh',
      'evaluatedAt', '2026-08-18T00:00:00.000Z',
      'lastSuccessfulAt', '2026-08-18T00:00:00.000Z',
      'coverageComplete', true,
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-1-profile',
        'projectId', p_project_id
      ))
    ),
    'boundaryNote',
      'This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility.'
  );
$$;

select public.finalize_project_brief_generation(
  'fa000000-0000-4000-8000-000000000001',
  'fa200000-0000-4000-8000-000000000001',
  '2026-08-01T00:00:00Z', '2026-08-18T00:00:00Z',
  'project-brief-v1', 'project-brief-schema-v1', repeat('a', 64), repeat('b', 64),
  repeat('d', 64),
  public.test_phase10_1_payload(current_setting('test.phase10_1_project')::uuid, repeat('a', 64)),
  pg_catalog.clock_timestamp() + interval '1 day',
  'deepseek', 'deepseek-chat', 'provider-request-safe', 10, 20, 30
);

select is(
  (select cache_equivalence_fingerprint from public.project_briefs
   where user_id = 'fa000000-0000-4000-8000-000000000001'),
  repeat('b', 64),
  'completed Brief stores the stable cache equivalence fingerprint'
);
select is(
  (select payload_fingerprint from public.project_briefs
   where user_id = 'fa000000-0000-4000-8000-000000000001'),
  repeat('d', 64),
  'completed Brief stores an independent payload integrity fingerprint'
);
select is(
  (select cache_equivalence_fingerprint from public.ai_invocations
   where reservation_id = 'fa200000-0000-4000-8000-000000000001'),
  repeat('b', 64),
  'cold invocation stores the same cache equivalence fingerprint'
);

select public.record_project_brief_cache_hit(
  'fa000000-0000-4000-8000-000000000001',
  (select id from public.project_briefs
   where user_id = 'fa000000-0000-4000-8000-000000000001'),
  repeat('c', 64), repeat('b', 64),
  pg_catalog.clock_timestamp() - interval '5 seconds'
);

select is(
  (select count(*)::integer from public.ai_invocations
   where user_id = 'fa000000-0000-4000-8000-000000000001'),
  2,
  'cache replay records exactly one additional observation without Provider work'
);
select ok(
  (select reservation_id is null and source_invocation_id is not null
     and cache_status = 'hit' and input_fingerprint = repeat('c', 64)
   from public.ai_invocations
   where user_id = 'fa000000-0000-4000-8000-000000000001'
     and cache_status = 'hit'),
  'cache-hit observation has zero-quota lineage to the original invocation'
);
select ok(
  (select created_at = started_at and started_at = completed_at
   from public.ai_invocations
   where user_id = 'fa000000-0000-4000-8000-000000000001'
     and cache_status = 'hit'),
  'cache-hit observation uses one authoritative database record time'
);

select throws_ok(
  $$
    select public.record_project_brief_cache_hit(
      'fa000000-0000-4000-8000-000000000001',
      (select id from public.project_briefs
       where user_id = 'fa000000-0000-4000-8000-000000000001'),
      repeat('e', 64), repeat('b', 64),
      pg_catalog.clock_timestamp() + interval '2 days'
    )
  $$,
  'P0001',
  'project_brief_generation_idempotency_conflict',
  'request observation time still fails closed when the cached Brief was already expired'
);
select is(
  (select count(*)::integer from public.ai_invocations
   where user_id = 'fa000000-0000-4000-8000-000000000001'),
  2,
  'expired cache replay does not persist an additional invocation'
);

select * from finish();
rollback;
