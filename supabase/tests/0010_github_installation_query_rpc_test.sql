begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public',
  'read_current_github_installation',
  array['uuid'],
  'narrow current GitHub installation read RPC exists'
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
      and procedure_record.proname = 'read_current_github_installation'
  $$,
  $expected$values ('postgres'::text, true, 'search_path=""'::text)$expected$,
  'installation read RPC is postgres-owned security definer with empty search_path'
);

select results_eq(
  $$
    select
      parameter.parameter_name::text collate "default",
      parameter.data_type::text collate "default",
      parameter.ordinal_position::integer
    from information_schema.parameters parameter
    where parameter.specific_schema = 'public'
      and parameter.specific_name like 'read_current_github_installation_%'
      and parameter.parameter_mode = 'OUT'
    order by parameter.ordinal_position
  $$,
  $expected$
    values
      ('installation_id'::text, 'bigint'::text, 2::integer),
      ('repository_selection'::text, 'character varying'::text, 3::integer),
      ('status'::text, 'character varying'::text, 4::integer)
  $expected$,
  'installation read RPC exposes exactly the three allowed columns'
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
    'public.read_current_github_installation(uuid)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.read_current_github_installation(uuid)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.read_current_github_installation(uuid)',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'public.read_current_github_installation(uuid)',
      'execute'
    ),
  'only postgres and service_role can execute the installation read RPC'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'aa000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'installation-query-a@example.test',
    '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'bb000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'installation-query-b@example.test',
    '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('aa000000-0000-4000-8000-000000000001'),
  ('bb000000-0000-4000-8000-000000000002');

insert into public.github_installations (
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
    'aa000000-0000-4000-8000-000000000001',
    8500101,
    7500101,
    'installation-query-a',
    'User',
    'selected',
    'active',
    null,
    null,
    now()
  ),
  (
    'bb000000-0000-4000-8000-000000000002',
    8500102,
    7500102,
    'installation-query-b',
    'User',
    'all',
    'active',
    null,
    null,
    now()
  );

select results_eq(
  $$
    select installation_id, repository_selection, status
    from public.read_current_github_installation(
      'aa000000-0000-4000-8000-000000000001'
    )
  $$,
  $expected$
    values (8500101::bigint, 'selected'::varchar, 'active'::varchar)
  $expected$,
  'RPC returns only the installation bound to the requested user'
);

select is_empty(
  $$
    select *
    from public.read_current_github_installation(
      'cc000000-0000-4000-8000-000000000003'
    )
  $$,
  'RPC returns no row when the user has no installation'
);

select results_eq(
  $$
    select installation_id, repository_selection, status
    from public.read_current_github_installation(
      'bb000000-0000-4000-8000-000000000002'
    )
  $$,
  $expected$
    values (8500102::bigint, 'all'::varchar, 'active'::varchar)
  $expected$,
  'cross-user calls return only the row for the explicitly supplied UUID'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc procedure_record
    where procedure_record.oid =
      'public.read_current_github_installation(uuid)'::regprocedure
      and (
        lower(pg_get_functiondef(procedure_record.oid)) like '%execute %'
        or lower(pg_get_functiondef(procedure_record.oid)) like '%format(%'
      )
  $$,
  array[0::bigint],
  'installation read RPC contains no dynamic SQL'
);

select * from finish();
rollback;
