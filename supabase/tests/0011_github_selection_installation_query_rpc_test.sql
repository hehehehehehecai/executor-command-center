begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public',
  'read_current_github_selection_installation',
  array['uuid'],
  'narrow selection installation read RPC exists'
);

select results_eq(
  $$
    select
      owner_record.rolname::text collate "default",
      procedure_record.prosecdef,
      procedure_record.provolatile::text collate "default",
      procedure_record.proconfig[1]::text collate "default"
    from pg_proc procedure_record
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_roles owner_record on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.proname =
        'read_current_github_selection_installation'
  $$,
  $expected$
    values ('postgres'::text, true, 's'::text, 'search_path=""'::text)
  $expected$,
  'selection installation RPC is postgres-owned stable security definer with empty search_path'
);

select results_eq(
  $$
    select
      parameter.parameter_name::text collate "default",
      parameter.data_type::text collate "default",
      parameter.ordinal_position::integer
    from information_schema.parameters parameter
    where parameter.specific_schema = 'public'
      and parameter.specific_name like
        'read_current_github_selection_installation_%'
      and parameter.parameter_mode = 'OUT'
    order by parameter.ordinal_position
  $$,
  $expected$
    values
      ('id'::text, 'uuid'::text, 2::integer),
      ('installation_id'::text, 'bigint'::text, 3::integer),
      ('status'::text, 'character varying'::text, 4::integer)
  $expected$,
  'selection installation RPC exposes exactly the three allowed columns'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.github_installations',
    'select'
  ),
  'service_role still has no direct github_installations SELECT'
);

select ok(
  not has_function_privilege(
    'public',
    'public.read_current_github_selection_installation(uuid)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.read_current_github_selection_installation(uuid)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.read_current_github_selection_installation(uuid)',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'public.read_current_github_selection_installation(uuid)',
      'execute'
    ),
  'only postgres and service_role can execute the selection installation RPC'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'ad000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'selection-installation-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'bd000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'selection-installation-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('ad000000-0000-4000-8000-000000000001'),
  ('bd000000-0000-4000-8000-000000000002');

insert into public.github_installations (
  id,
  user_id,
  installation_id,
  github_account_id,
  github_account_login,
  account_type,
  repository_selection,
  status,
  suspended_at,
  revoked_at,
  last_verified_at
) values
  (
    'ae000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001',
    8700101,
    7700101,
    'selection-installation-a',
    'User',
    'selected',
    'active',
    null,
    null,
    now()
  ),
  (
    'be000000-0000-4000-8000-000000000002',
    'bd000000-0000-4000-8000-000000000002',
    8700102,
    7700102,
    'selection-installation-b',
    'User',
    'all',
    'active',
    null,
    null,
    now()
  );

select results_eq(
  $$
    select id, installation_id, status
    from public.read_current_github_selection_installation(
      'ad000000-0000-4000-8000-000000000001'
    )
  $$,
  $expected$
    values (
      'ae000000-0000-4000-8000-000000000001'::uuid,
      8700101::bigint,
      'active'::varchar
    )
  $expected$,
  'RPC returns only the selection installation bound to the requested user'
);

select is_empty(
  $$
    select *
    from public.read_current_github_selection_installation(
      'cd000000-0000-4000-8000-000000000003'
    )
  $$,
  'RPC returns no row when the user has no installation'
);

select results_eq(
  $$
    select id, installation_id, status
    from public.read_current_github_selection_installation(
      'bd000000-0000-4000-8000-000000000002'
    )
  $$,
  $expected$
    values (
      'be000000-0000-4000-8000-000000000002'::uuid,
      8700102::bigint,
      'active'::varchar
    )
  $expected$,
  'cross-user calls return only the row for the explicitly supplied UUID'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc procedure_record
    where procedure_record.oid =
      'public.read_current_github_selection_installation(uuid)'::regprocedure
      and (
        lower(pg_get_functiondef(procedure_record.oid)) like '%execute %'
        or lower(pg_get_functiondef(procedure_record.oid)) like '%format(%'
      )
  $$,
  array[0::bigint],
  'selection installation RPC contains no dynamic SQL'
);

select * from finish();
rollback;
