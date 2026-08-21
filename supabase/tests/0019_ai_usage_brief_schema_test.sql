begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'ai_invocations', 'AI invocation table exists');
select has_table('public', 'energy_ledger_entries', 'energy ledger table exists');
select has_table('public', 'energy_reservations', 'energy reservation table exists');
select has_table('public', 'project_briefs', 'project brief table exists');

select columns_are(
  'public', 'energy_reservations',
  array[
    'id', 'user_id', 'project_id', 'business_date', 'request_key', 'amount',
    'status', 'created_at', 'consumed_at', 'released_at',
    'failure_stage', 'error_code'
  ],
  'reservation columns freeze ownership, idempotency, lifecycle and durable failure'
);
select columns_are(
  'public', 'energy_ledger_entries',
  array[
    'id', 'user_id', 'project_id', 'business_date', 'idempotency_key',
    'entry_type', 'amount', 'delta', 'reservation_id', 'invocation_id',
    'created_at', 'metadata'
  ],
  'ledger columns freeze immutable daily accounting facts'
);
select columns_are(
  'public', 'ai_invocations',
  array[
    'id', 'user_id', 'project_id', 'feature', 'provider', 'model',
    'prompt_version', 'schema_version', 'input_fingerprint', 'status',
    'input_tokens', 'output_tokens', 'latency_ms', 'cost_microunits',
    'cache_status', 'failure_stage', 'error_code', 'reservation_id',
    'brief_id', 'created_at', 'started_at', 'completed_at',
    'provider_request_id', 'cache_equivalence_fingerprint',
    'source_invocation_id'
  ],
  'invocation columns retain safe provider observability and request lineage'
);
select columns_are(
  'public', 'project_briefs',
  array[
    'id', 'user_id', 'project_id', 'range_start', 'range_end',
    'prompt_version', 'schema_version', 'evidence_fingerprint', 'status',
    'payload', 'failure_stage', 'error_code', 'created_at', 'completed_at',
    'expires_at', 'cache_equivalence_fingerprint', 'payload_fingerprint'
  ],
  'brief columns keep Phase 1 persistence separate from the future output schema'
);

select results_eq(
  $$
    select relname::text collate "default"
    from pg_class
    where oid in (
      'public.ai_invocations'::regclass,
      'public.energy_ledger_entries'::regclass,
      'public.energy_reservations'::regclass,
      'public.project_briefs'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
    order by relname
  $$,
  array[
    'ai_invocations', 'energy_ledger_entries',
    'energy_reservations', 'project_briefs'
  ],
  'all four user tables enable and force RLS'
);

select policies_are(
  'public', 'ai_invocations', array['ai_invocations_select_own'],
  'invocations expose only own-row reads'
);
select policies_are(
  'public', 'energy_ledger_entries', array['energy_ledger_entries_select_own'],
  'ledger exposes only own-row reads'
);
select policies_are(
  'public', 'energy_reservations', array['energy_reservations_select_own'],
  'reservations expose only own-row reads'
);
select policies_are(
  'public', 'project_briefs', array['project_briefs_select_own'],
  'briefs expose only own-row reads'
);

select ok(
  has_table_privilege('authenticated', 'public.ai_invocations', 'select')
    and has_table_privilege('authenticated', 'public.energy_ledger_entries', 'select')
    and has_table_privilege('authenticated', 'public.energy_reservations', 'select')
    and has_table_privilege('authenticated', 'public.project_briefs', 'select'),
  'authenticated can read all four tables through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.ai_invocations', 'insert,update,delete')
    and not has_table_privilege('authenticated', 'public.energy_ledger_entries', 'insert,update,delete')
    and not has_table_privilege('authenticated', 'public.energy_reservations', 'insert,update,delete')
    and not has_table_privilege('authenticated', 'public.project_briefs', 'insert,update,delete')
    and not has_table_privilege('service_role', 'public.energy_ledger_entries', 'insert,update,delete'),
  'clients and service role cannot bypass controlled persistence paths'
);

select has_function(
  'public', 'reserve_energy', array['uuid', 'date', 'text', 'integer'],
  'atomic reserve RPC exists'
);
select has_function(
  'public', 'consume_energy', array['uuid'],
  'idempotent consume RPC exists'
);
select has_function(
  'public', 'release_energy', array['uuid'],
  'idempotent release RPC exists'
);
select has_function(
  'public', 'get_available_energy', array['date'],
  'current-user available balance RPC exists'
);

select results_eq(
  $$
    select proname::text collate "default"
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and proname in (
        'reserve_energy', 'consume_energy', 'release_energy',
        'get_available_energy'
      )
      and prosecdef
      and proconfig = array['search_path=""']::text[]
    order by proname
  $$,
  array[
    'consume_energy', 'get_available_energy', 'release_energy', 'reserve_energy'
  ],
  'all energy RPCs are security definer functions with empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.reserve_energy(uuid,date,text,integer)', 'execute')
    and has_function_privilege('authenticated', 'public.consume_energy(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.release_energy(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.get_available_energy(date)', 'execute')
    and not has_function_privilege('anon', 'public.reserve_energy(uuid,date,text,integer)', 'execute')
    and not has_function_privilege('service_role', 'public.reserve_energy(uuid,date,text,integer)', 'execute'),
  'only authenticated callers receive energy RPC execution'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.energy_reservations'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%(user_id, business_date, request_key)%'
  $$,
  array[1::bigint],
  'reservation idempotency key is unique per user and business date'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.project_briefs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%evidence_fingerprint%'
      and pg_get_constraintdef(oid) like '%payload%'
  $$,
  array[1::bigint],
  'completed brief validation lineage is database-enforced'
);

select * from finish();
rollback;
