begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public',
  'read_current_github_identity',
  array['uuid'],
  'narrow current GitHub identity read RPC exists'
);

select results_eq(
  $$
    select
      owner_record.rolname::text collate "default",
      procedure_record.prosecdef,
      procedure_record.proconfig[1]::text collate "default"
    from pg_proc procedure_record
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_roles owner_record on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'read_current_github_identity'
  $$,
  $expected$values ('postgres'::text, true, 'search_path=""'::text)$expected$,
  'identity read RPC is postgres-owned security definer with empty search_path'
);

select results_eq(
  $$
    select
      pg_get_function_result(procedure_record.oid)::text collate "default",
      procedure_record.proretset
    from pg_proc procedure_record
    where procedure_record.oid =
      'public.read_current_github_identity(uuid)'::regprocedure
  $$,
  $expected$values ('bigint'::text, false)$expected$,
  'identity read RPC returns only one scalar github_user_id and no other columns'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.github_identities',
    'select'
  ),
  'service_role still has no direct github_identities SELECT'
);

select ok(
  not has_function_privilege(
    'public',
    'public.read_current_github_identity(uuid)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.read_current_github_identity(uuid)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.read_current_github_identity(uuid)',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'public.read_current_github_identity(uuid)',
      'execute'
    ),
  'only postgres and service_role can execute the identity read RPC'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  'a9000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'identity-read@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.users (id)
values ('a9000000-0000-4000-8000-000000000001');

insert into public.github_identities (
  user_id,
  github_user_id,
  github_login,
  avatar_url
) values (
  'a9000000-0000-4000-8000-000000000001',
  790001,
  'identity-read-fixture',
  'https://avatars.example.test/u/790001'
);

select is(
  public.read_current_github_identity(
    'a9000000-0000-4000-8000-000000000001'
  ),
  790001::bigint,
  'RPC returns the matching github_user_id'
);

select is(
  public.read_current_github_identity(
    'b9000000-0000-4000-8000-000000000002'
  ),
  null::bigint,
  'RPC returns null when the user has no GitHub identity'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc procedure_record
    where procedure_record.oid =
      'public.read_current_github_identity(uuid)'::regprocedure
      and (
        lower(pg_get_functiondef(procedure_record.oid)) like '%execute %'
        or lower(pg_get_functiondef(procedure_record.oid)) like '%format(%'
      )
  $$,
  array[0::bigint],
  'identity read RPC contains no dynamic SQL'
);

select * from finish();
rollback;
