begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

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
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'identity-a@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'identity-b@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

select has_function(
  'public',
  'ensure_user_identity',
  array['uuid', 'bigint', 'character varying', 'text'],
  'atomic identity RPC exists with explicit input types'
);
select results_eq(
  $$
    select public.ensure_user_identity(
      '11111111-1111-4111-8111-111111111111',
      101,
      'identity-a',
      'https://avatars.example.test/a.png'
    )
  $$,
  array['11111111-1111-4111-8111-111111111111'::uuid],
  'first ensure returns the internal Auth UUID'
);
select results_eq(
  $$select count(*)::bigint from public.users$$,
  array[1::bigint],
  'first ensure creates one internal user'
);
select results_eq(
  $$select count(*)::bigint from public.github_identities$$,
  array[1::bigint],
  'first ensure creates one GitHub identity'
);
select isnt(
  (
    select id::text
    from public.users
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  '101',
  'internal user ID is not the GitHub numeric ID'
);

select results_eq(
  $$
    select public.ensure_user_identity(
      '11111111-1111-4111-8111-111111111111',
      101,
      'identity-a',
      'https://avatars.example.test/a.png'
    )
  $$,
  array['11111111-1111-4111-8111-111111111111'::uuid],
  'repeated ensure returns the same user ID'
);
select results_eq(
  $$select count(*)::bigint from public.users$$,
  array[1::bigint],
  'repeated ensure does not duplicate users'
);
select results_eq(
  $$select count(*)::bigint from public.github_identities$$,
  array[1::bigint],
  'repeated ensure does not duplicate identities'
);

select results_eq(
  $$
    select public.ensure_user_identity(
      '11111111-1111-4111-8111-111111111111',
      101,
      'identity-a-renamed',
      'https://avatars.example.test/a-new.png'
    )
  $$,
  array['11111111-1111-4111-8111-111111111111'::uuid],
  'display refresh preserves the same user ID'
);
select results_eq(
  $$
    select github_login || '|' || avatar_url
    from public.github_identities
    where github_user_id = 101
  $$,
  array['identity-a-renamed|https://avatars.example.test/a-new.png'::text],
  'GitHub login and avatar refresh in place'
);
select results_eq(
  $$select count(*)::bigint from public.github_identities$$,
  array[1::bigint],
  'display refresh does not create another identity'
);

select throws_ok(
  $$
    select public.ensure_user_identity(
      '22222222-2222-4222-8222-222222222222',
      101,
      'identity-hijack',
      null
    )
  $$,
  'P0001',
  'identity_github_user_conflict',
  'another Auth user cannot take an existing GitHub identity'
);
select results_eq(
  $$select user_id from public.github_identities where github_user_id = 101$$,
  array['11111111-1111-4111-8111-111111111111'::uuid],
  'GitHub identity conflict preserves the original binding'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.users
    where id = '22222222-2222-4222-8222-222222222222'
  $$,
  array[0::bigint],
  'GitHub identity conflict leaves no orphan internal user'
);

select throws_ok(
  $$
    select public.ensure_user_identity(
      '11111111-1111-4111-8111-111111111111',
      202,
      'different-identity',
      null
    )
  $$,
  'P0001',
  'identity_auth_user_conflict',
  'an Auth user cannot silently switch GitHub identity'
);
select results_eq(
  $$select github_user_id from public.github_identities where user_id = '11111111-1111-4111-8111-111111111111'$$,
  array[101::bigint],
  'Auth user conflict preserves the original GitHub identity'
);
select results_eq(
  $$select count(*)::bigint from public.github_identities where github_user_id = 202$$,
  array[0::bigint],
  'Auth user conflict does not create a replacement identity'
);

select throws_ok(
  $$
    select public.ensure_user_identity(
      '33333333-3333-4333-8333-333333333333',
      303,
      'missing-auth-user',
      null
    )
  $$,
  'P0002',
  'auth_user_not_found',
  'ensure rejects an unknown Supabase Auth user'
);
select results_eq(
  $$select count(*)::bigint from public.users where id = '33333333-3333-4333-8333-333333333333'$$,
  array[0::bigint],
  'unknown Auth user rejection performs no partial write'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.ensure_user_identity(uuid,bigint,character varying,text)',
    'execute'
  ),
  'anon cannot execute the identity RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.ensure_user_identity(uuid,bigint,character varying,text)',
    'execute'
  ),
  'authenticated cannot execute the identity RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.ensure_user_identity(uuid,bigint,character varying,text)',
    'execute'
  ),
  'service_role can execute the narrow identity RPC'
);
select results_eq(
  $$
    select procedure_record.prosecdef
    from pg_proc procedure_record
    where procedure_record.oid =
      'public.ensure_user_identity(uuid,bigint,character varying,text)'::regprocedure
  $$,
  array[true],
  'identity RPC is security definer for atomic server-side writes'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc procedure_record
    where procedure_record.oid =
      'public.ensure_user_identity(uuid,bigint,character varying,text)'::regprocedure
      and 'search_path=""' = any(procedure_record.proconfig)
  $$,
  array[1::bigint],
  'identity RPC fixes an empty search_path'
);

select * from finish();

rollback;
