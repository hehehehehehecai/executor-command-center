begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

select has_table(
  'public',
  'github_installations',
  'github_installations table exists'
);
select has_table(
  'public',
  'github_installation_states',
  'github_installation_states table exists'
);

select columns_are(
  'public',
  'github_installations',
  array[
    'id',
    'user_id',
    'installation_id',
    'github_account_id',
    'github_account_login',
    'account_type',
    'repository_selection',
    'status',
    'suspended_at',
    'revoked_at',
    'last_verified_at',
    'created_at',
    'updated_at'
  ],
  'installation columns match the frozen contract'
);
select columns_are(
  'public',
  'github_installation_states',
  array[
    'id',
    'user_id',
    'state_hash',
    'return_to',
    'expires_at',
    'consumed_at',
    'created_at'
  ],
  'state columns match the frozen contract'
);
select col_type_is(
  'public',
  'github_installations',
  'installation_id',
  'bigint',
  'installation_id is bigint'
);
select col_type_is(
  'public',
  'github_installations',
  'github_account_id',
  'bigint',
  'github_account_id is bigint'
);
select col_type_is(
  'public',
  'github_installations',
  'github_account_login',
  'character varying(255)',
  'GitHub login has the frozen database limit'
);
select col_type_is(
  'public',
  'github_installation_states',
  'state_hash',
  'text',
  'only the state hash is stored'
);
select has_pk(
  'public',
  'github_installations',
  'installations have an internal primary key'
);
select has_pk(
  'public',
  'github_installation_states',
  'states have an internal primary key'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_installations'::regclass
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid) =
        'UNIQUE (installation_id)'
  $$,
  array[1::bigint],
  'installation_id is globally unique'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_installations'::regclass
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid) =
        'UNIQUE (user_id, github_account_id)'
  $$,
  array[1::bigint],
  'one current installation exists per internal user and GitHub account'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_installation_states'::regclass
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid) = 'UNIQUE (state_hash)'
  $$,
  array[1::bigint],
  'state hashes cannot be reused'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_installations'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.users'::regclass
  $$,
  array[1::bigint],
  'installations.user_id references users'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_installation_states'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.users'::regclass
  $$,
  array[1::bigint],
  'states.user_id references users'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_installations'::regclass
      and constraint_record.contype = 'c'
  $$,
  array[6::bigint],
  'installation shape and status timestamps have explicit checks'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_installation_states'::regclass
      and constraint_record.contype = 'c'
  $$,
  array[2::bigint],
  'state hash and return path have explicit checks'
);
select results_eq(
  $$
    select relation_record.relrowsecurity
    from pg_class relation_record
    where relation_record.oid = 'public.github_installations'::regclass
  $$,
  array[true],
  'installations have RLS enabled'
);
select results_eq(
  $$
    select relation_record.relrowsecurity
    from pg_class relation_record
    where relation_record.oid = 'public.github_installation_states'::regclass
  $$,
  array[true],
  'states have RLS enabled'
);
select policies_are(
  'public',
  'github_installations',
  array['github_installations_select_own'],
  'installations expose only the own-row read policy'
);
select policies_are(
  'public',
  'github_installation_states',
  array[]::text[],
  'states expose no client policy'
);

select has_function(
  'public',
  'create_github_installation_state',
  array['uuid', 'text', 'text', 'timestamp with time zone'],
  'narrow state creation RPC exists'
);
select has_function(
  'public',
  'consume_github_installation_state',
  array['uuid', 'text'],
  'atomic state consumption RPC exists'
);
select has_function(
  'public',
  'register_verified_github_installation',
  array[
    'uuid',
    'bigint',
    'bigint',
    'character varying',
    'character varying',
    'character varying',
    'character varying',
    'timestamp with time zone',
    'timestamp with time zone'
  ],
  'atomic verified installation registration RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_github_installation_state(uuid,text,text,timestamp with time zone)',
    'execute'
  ),
  'anon cannot create installation states'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_github_installation_state(uuid,text,text,timestamp with time zone)',
    'execute'
  ),
  'authenticated cannot create installation states'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_github_installation_state(uuid,text,text,timestamp with time zone)',
    'execute'
  ),
  'service role can create installation states'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_github_installation_state(uuid,text)',
    'execute'
  ),
  'authenticated cannot consume installation states'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.register_verified_github_installation(uuid,bigint,bigint,character varying,character varying,character varying,character varying,timestamp with time zone,timestamp with time zone)',
    'execute'
  ),
  'authenticated cannot register installations'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc procedure_record
    where procedure_record.oid in (
      'public.create_github_installation_state(uuid,text,text,timestamp with time zone)'::regprocedure,
      'public.consume_github_installation_state(uuid,text)'::regprocedure,
      'public.register_verified_github_installation(uuid,bigint,bigint,character varying,character varying,character varying,character varying,timestamp with time zone,timestamp with time zone)'::regprocedure
    )
      and procedure_record.prosecdef
      and 'search_path=""' = any(procedure_record.proconfig)
  $$,
  array[3::bigint],
  'all installation RPCs are security definer with an empty search_path'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'installation-a@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'installation-b@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.users (id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.github_identities (user_id, github_user_id, github_login)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 71001, 'fixture-user-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 71002, 'fixture-user-b');

insert into public.github_installations (
  user_id,
  installation_id,
  github_account_id,
  github_account_login,
  account_type,
  repository_selection,
  status,
  last_verified_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    81001,
    71001,
    'fixture-user-a',
    'User',
    'selected',
    'active',
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    81002,
    71002,
    'fixture-user-b',
    'User',
    'all',
    'active',
    now()
  );

insert into public.github_installation_states (
  user_id,
  state_hash,
  return_to,
  expires_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('a', 64),
  '/onboarding',
  now() + interval '10 minutes'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.github_installations$$,
  '42501',
  'permission denied for table github_installations',
  'anon cannot read installations'
);
select throws_ok(
  $$select count(*) from public.github_installation_states$$,
  '42501',
  'permission denied for table github_installation_states',
  'anon cannot enumerate states'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);
select results_eq(
  $$select installation_id from public.github_installations order by installation_id$$,
  array[81001::bigint],
  'User A can read only their own installation'
);
select results_eq(
  $$select count(*)::bigint from public.github_installations where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array[0::bigint],
  'User A cannot read User B installation'
);
select throws_ok(
  $$select count(*) from public.github_installation_states$$,
  '42501',
  'permission denied for table github_installation_states',
  'authenticated cannot enumerate states'
);
select throws_ok(
  $$
    insert into public.github_installations (
      user_id,
      installation_id,
      github_account_id,
      github_account_login,
      account_type,
      repository_selection,
      status,
      last_verified_at
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      89999,
      71001,
      'forged',
      'User',
      'all',
      'active',
      now()
    )
  $$,
  '42501',
  'permission denied for table github_installations',
  'authenticated cannot forge an installation'
);
select throws_ok(
  $$delete from public.github_installations where installation_id = 81002$$,
  '42501',
  'permission denied for table github_installations',
  'authenticated cannot delete another installation'
);
reset role;

select * from finish();

rollback;
