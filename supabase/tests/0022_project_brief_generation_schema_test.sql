begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column(
  'public', 'energy_reservations', 'failure_stage',
  'reservations persist a safe generation failure stage'
);
select has_column(
  'public', 'energy_reservations', 'error_code',
  'reservations persist a safe generation failure code'
);
select has_column(
  'public', 'ai_invocations', 'provider_request_id',
  'provider request id is retained as safe Invocation lineage'
);
select has_function(
  'public', 'finalize_project_brief_generation',
  array['uuid', 'uuid', 'timestamptz', 'timestamptz', 'text', 'text', 'text', 'jsonb',
        'timestamptz', 'text', 'text', 'text', 'integer', 'integer', 'integer'],
  'one RPC atomically saves a validated Brief and Invocation before consuming energy'
);
select has_function(
  'public', 'fail_project_brief_generation',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
        'integer', 'integer', 'integer'],
  'one RPC durably records a safe failure and releases energy'
);
select has_function(
  'public', 'get_project_brief_generation_outcome', array['uuid'],
  'durable replay outcome can be read without an in-process lock'
);
select has_index(
  'public', 'ai_invocations', 'ai_invocations_reservation_unique_idx',
  'one reservation can own at most one invocation'
);
select has_index(
  'public', 'project_briefs', 'project_briefs_cache_lookup_idx',
  'completed cache lookup has a composite index'
);

select function_privs_are(
  'public', 'finalize_project_brief_generation',
  array['uuid', 'uuid', 'timestamptz', 'timestamptz', 'text', 'text', 'text', 'jsonb',
        'timestamptz', 'text', 'text', 'text', 'integer', 'integer', 'integer'],
  'service_role', array['EXECUTE'],
  'only the trusted server role receives the finalization RPC grant'
);
select function_privs_are(
  'public', 'fail_project_brief_generation',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
        'integer', 'integer', 'integer'],
  'service_role', array[]::text[],
  'the legacy failure RPC without an Evidence fingerprint is disabled'
);
select function_privs_are(
  'public', 'finalize_project_brief_generation',
  array['uuid', 'uuid', 'timestamptz', 'timestamptz', 'text', 'text', 'text', 'jsonb',
        'timestamptz', 'text', 'text', 'text', 'integer', 'integer', 'integer'],
  'authenticated', array[]::text[],
  'authenticated clients cannot bypass Schema and Evidence validation'
);

select * from finish();
rollback;
