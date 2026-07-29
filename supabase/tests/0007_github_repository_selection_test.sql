begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_table(
  'public',
  'selected_repositories',
  'selected_repositories table exists'
);

select hasnt_table('public', 'projects', 'projects table remains absent');
select hasnt_table(
  'public',
  'project_profiles',
  'project_profiles table remains absent'
);
select hasnt_table(
  'public',
  'repository_snapshots',
  'repository_snapshots table remains absent'
);
select hasnt_table('public', 'sync_runs', 'sync_runs table remains absent');
select hasnt_table(
  'public',
  'webhook_deliveries',
  'webhook_deliveries table remains absent'
);
select hasnt_table(
  'public',
  'commit_records',
  'commit_records table remains absent'
);
select hasnt_table(
  'public',
  'issue_records',
  'issue_records table remains absent'
);
select hasnt_table(
  'public',
  'pull_request_records',
  'pull_request_records table remains absent'
);

select columns_are(
  'public',
  'selected_repositories',
  array[
    'id',
    'user_id',
    'github_installation_id',
    'github_repository_id',
    'owner_login',
    'name',
    'full_name',
    'visibility',
    'is_private',
    'is_fork',
    'is_archived',
    'is_disabled',
    'default_branch',
    'selected_at',
    'created_at',
    'updated_at'
  ],
  'selection columns match the frozen contract'
);

select results_eq(
  $$
    select constraint_record.conname::text collate "default"
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.selected_repositories'::regclass
    order by constraint_record.conname
  $$,
  array[
    'selected_repositories_default_branch_check',
    'selected_repositories_full_name_check',
    'selected_repositories_github_installation_id_fkey',
    'selected_repositories_installation_repository_key',
    'selected_repositories_name_check',
    'selected_repositories_owner_login_check',
    'selected_repositories_pkey',
    'selected_repositories_repository_id_check',
    'selected_repositories_user_id_fkey',
    'selected_repositories_user_repository_key',
    'selected_repositories_visibility_check'
  ],
  'all selection constraints have the exact frozen names'
);

select results_eq(
  $$
    select pg_get_constraintdef(constraint_record.oid)
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.selected_repositories'::regclass
      and constraint_record.conname = 'selected_repositories_user_id_fkey'
  $$,
  array['FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'],
  'user deletion deterministically cascades to selections'
);

select results_eq(
  $$
    select pg_get_constraintdef(constraint_record.oid)
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.selected_repositories'::regclass
      and constraint_record.conname =
        'selected_repositories_github_installation_id_fkey'
  $$,
  array[
    'FOREIGN KEY (github_installation_id) REFERENCES github_installations(id) ON DELETE RESTRICT'
  ],
  'installation deletion is restricted while selections reference it'
);

select results_eq(
  $$
    select pg_get_constraintdef(constraint_record.oid)
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.selected_repositories'::regclass
      and constraint_record.contype = 'u'
    order by constraint_record.conname
  $$,
  array[
    'UNIQUE (github_installation_id, github_repository_id)',
    'UNIQUE (user_id, github_repository_id)'
  ],
  'both frozen repository identity constraints exist'
);

select results_eq(
  $$
    select index_record.indexname::text collate "default"
    from pg_indexes index_record
    where index_record.schemaname = 'public'
      and index_record.tablename = 'selected_repositories'
    order by index_record.indexname
  $$,
  array[
    'selected_repositories_installation_repository_key',
    'selected_repositories_pkey',
    'selected_repositories_user_repository_key',
    'selected_repositories_user_sort_idx'
  ],
  'selection indexes match the frozen set'
);

select results_eq(
  $$
    select pg_get_indexdef(index_record.indexrelid)
    from pg_index index_record
    join pg_class relation_record
      on relation_record.oid = index_record.indrelid
    join pg_class index_relation
      on index_relation.oid = index_record.indexrelid
    where relation_record.oid = 'public.selected_repositories'::regclass
      and index_relation.relname = 'selected_repositories_user_sort_idx'
  $$,
  array[
    'CREATE INDEX selected_repositories_user_sort_idx ON public.selected_repositories USING btree (user_id, lower((full_name)::text), github_repository_id)'
  ],
  'selection read index fixes lowercase full_name and repository ID ordering'
);

select results_eq(
  $$
    select trigger_record.tgname::text collate "default"
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.selected_repositories'::regclass
      and not trigger_record.tgisinternal
  $$,
  array['selected_repositories_set_updated_at'],
  'selection reuses one explicit updated_at trigger'
);

select results_eq(
  $$
    select procedure_record.proname::text collate "default"
    from pg_trigger trigger_record
    join pg_proc procedure_record
      on procedure_record.oid = trigger_record.tgfoid
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where trigger_record.tgrelid = 'public.selected_repositories'::regclass
      and trigger_record.tgname = 'selected_repositories_set_updated_at'
      and namespace_record.nspname = 'app_private'
  $$,
  array['set_updated_at'],
  'selection trigger reuses app_private.set_updated_at'
);

select results_eq(
  $$
    select relation_record.relrowsecurity
    from pg_class relation_record
    where relation_record.oid = 'public.selected_repositories'::regclass
  $$,
  array[true],
  'selected_repositories has RLS enabled'
);

select policies_are(
  'public',
  'selected_repositories',
  array['selected_repositories_select_own'],
  'selected_repositories exposes only the own-row read policy'
);

select results_eq(
  $$
    select
      policy_record.cmd::text,
      policy_record.roles::text collate "default",
      policy_record.qual::text collate "default",
      policy_record.with_check::text collate "default"
    from pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'selected_repositories'
      and policy_record.policyname = 'selected_repositories_select_own'
  $$,
  $expected$
    values (
      'SELECT'::text,
      '{authenticated}'::text,
      '(user_id = ( SELECT auth.uid() AS uid))'::text,
      null::text
    )
  $expected$,
  'the only client policy reads auth.uid own rows'
);

select ok(
  not has_table_privilege('anon', 'public.selected_repositories', 'select')
    and not has_table_privilege(
      'anon',
      'public.selected_repositories',
      'insert'
    )
    and not has_table_privilege(
      'anon',
      'public.selected_repositories',
      'update'
    )
    and not has_table_privilege(
      'anon',
      'public.selected_repositories',
      'delete'
    ),
  'anon has no selection table privileges'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.selected_repositories',
    'select'
  ),
  'authenticated can select selections through RLS'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.selected_repositories',
    'insert'
  )
    and not has_table_privilege(
      'authenticated',
      'public.selected_repositories',
      'update'
    )
    and not has_table_privilege(
      'authenticated',
      'public.selected_repositories',
      'delete'
    ),
  'authenticated has no direct selection writes'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.selected_repositories',
    'insert'
  )
    and not has_table_privilege(
      'service_role',
      'public.selected_repositories',
      'update'
    )
    and not has_table_privilege(
      'service_role',
      'public.selected_repositories',
      'delete'
    ),
  'service_role direct selection writes are closed'
);

select has_function(
  'public',
  'ensure_selected_github_repository',
  array[
    'uuid',
    'uuid',
    'bigint',
    'character varying',
    'character varying',
    'character varying',
    'text',
    'boolean',
    'boolean',
    'boolean',
    'boolean',
    'character varying'
  ],
  'atomic selection ensure RPC exists'
);

select has_function(
  'public',
  'remove_selected_github_repository',
  array['uuid', 'bigint'],
  'idempotent selection remove RPC exists'
);

select results_eq(
  $$
    select
      owner_record.rolname::text collate "default",
      procedure_record.prosecdef,
      procedure_record.proconfig::text collate "default"
    from pg_proc procedure_record
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'ensure_selected_github_repository',
        'remove_selected_github_repository'
      )
    order by procedure_record.proname
  $$,
  $expected$
    values
      ('postgres'::text, true, '{"search_path=\"\""}'::text),
      ('postgres'::text, true, '{"search_path=\"\""}'::text)
  $expected$,
  'both RPCs are postgres-owned security definers with an empty search_path'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc procedure_record
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'ensure_selected_github_repository',
        'remove_selected_github_repository'
      )
      and (
        lower(pg_get_functiondef(procedure_record.oid)) like '%execute %'
        or lower(pg_get_functiondef(procedure_record.oid)) like '%format(%'
      )
  $$,
  array[0::bigint],
  'selection RPCs contain no dynamic SQL'
);

select ok(
  not has_function_privilege(
    'public',
    'public.ensure_selected_github_repository(uuid,uuid,bigint,character varying,character varying,character varying,text,boolean,boolean,boolean,boolean,character varying)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.ensure_selected_github_repository(uuid,uuid,bigint,character varying,character varying,character varying,text,boolean,boolean,boolean,boolean,character varying)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.ensure_selected_github_repository(uuid,uuid,bigint,character varying,character varying,character varying,text,boolean,boolean,boolean,boolean,character varying)',
      'execute'
    )
    and has_function_privilege(
      'postgres',
      'public.ensure_selected_github_repository(uuid,uuid,bigint,character varying,character varying,character varying,text,boolean,boolean,boolean,boolean,character varying)',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'public.ensure_selected_github_repository(uuid,uuid,bigint,character varying,character varying,character varying,text,boolean,boolean,boolean,boolean,character varying)',
      'execute'
    ),
  'ensure RPC is executable only by postgres and service_role'
);

select ok(
  not has_function_privilege(
    'public',
    'public.remove_selected_github_repository(uuid,bigint)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.remove_selected_github_repository(uuid,bigint)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.remove_selected_github_repository(uuid,bigint)',
      'execute'
    )
    and has_function_privilege(
      'postgres',
      'public.remove_selected_github_repository(uuid,bigint)',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'public.remove_selected_github_repository(uuid,bigint)',
      'execute'
    ),
  'remove RPC is executable only by postgres and service_role'
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
    'a5000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'selection-a@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'b5000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'selection-b@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.users (id)
values
  ('a5000000-0000-4000-8000-000000000001'),
  ('b5000000-0000-4000-8000-000000000002');

insert into public.github_identities (user_id, github_user_id, github_login)
values
  ('a5000000-0000-4000-8000-000000000001', 950001, 'selection-user-a'),
  ('b5000000-0000-4000-8000-000000000002', 950002, 'selection-user-b');

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
  last_verified_at
)
values
  (
    'a5100000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    951001,
    950001,
    'selection-user-a',
    'User',
    'selected',
    'active',
    null,
    now()
  ),
  (
    'a5100000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000001',
    951002,
    950003,
    'selection-user-a-alt',
    'User',
    'selected',
    'active',
    null,
    now()
  ),
  (
    'a5100000-0000-4000-8000-000000000003',
    'a5000000-0000-4000-8000-000000000001',
    951003,
    950004,
    'selection-user-a-suspended',
    'User',
    'selected',
    'suspended',
    now(),
    now()
  ),
  (
    'b5100000-0000-4000-8000-000000000002',
    'b5000000-0000-4000-8000-000000000002',
    952002,
    950002,
    'selection-user-b',
    'User',
    'all',
    'active',
    null,
    now()
  );

set local role anon;
select throws_ok(
  $$select count(*) from public.selected_repositories$$,
  '42501',
  'permission denied for table selected_repositories',
  'anon cannot read selections'
);
reset role;

select throws_ok(
  $$
    select *
    from public.ensure_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      'a5199999-0000-4000-8000-000000000099',
      960001,
      'owner-a',
      'repository-a',
      'owner-a/repository-a',
      'private',
      true,
      false,
      false,
      false,
      'main'
    )
  $$,
  'P0002',
  'github_repository_selection_installation_not_found',
  'ensure rejects a missing installation'
);

select throws_ok(
  $$
    select *
    from public.ensure_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      'b5100000-0000-4000-8000-000000000002',
      960001,
      'owner-a',
      'repository-a',
      'owner-a/repository-a',
      'private',
      true,
      false,
      false,
      false,
      'main'
    )
  $$,
  'P0001',
  'github_repository_selection_installation_wrong_user',
  'ensure rejects a cross-user installation'
);

select throws_ok(
  $$
    select *
    from public.ensure_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      'a5100000-0000-4000-8000-000000000003',
      960001,
      'owner-a',
      'repository-a',
      'owner-a/repository-a',
      'private',
      true,
      false,
      false,
      false,
      'main'
    )
  $$,
  'P0001',
  'github_repository_selection_installation_not_active',
  'ensure rejects a non-active installation'
);

select lives_ok(
  $$
    select *
    from public.ensure_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      'a5100000-0000-4000-8000-000000000001',
      960001,
      'owner-a',
      'repository-a',
      'owner-a/repository-a',
      'private',
      true,
      false,
      false,
      false,
      'main'
    )
  $$,
  'ensure creates an authorized repository selection'
);

select results_eq(
  $$
    select
      user_id,
      github_installation_id,
      github_repository_id,
      owner_login::text,
      name::text,
      full_name::text,
      visibility,
      is_private,
      is_fork,
      is_archived,
      is_disabled,
      default_branch::text
    from public.selected_repositories
    where user_id = 'a5000000-0000-4000-8000-000000000001'
      and github_repository_id = 960001
  $$,
  $expected$
    values (
      'a5000000-0000-4000-8000-000000000001'::uuid,
      'a5100000-0000-4000-8000-000000000001'::uuid,
      960001::bigint,
      'owner-a'::text,
      'repository-a'::text,
      'owner-a/repository-a'::text,
      'private'::text,
      true,
      false,
      false,
      false,
      'main'::text
    )
  $expected$,
  'ensure persists only the frozen repository DTO'
);

create temporary table phase_5_selection_before_repeat
on commit drop
as
select
  id,
  user_id,
  github_installation_id,
  github_repository_id,
  selected_at,
  created_at,
  updated_at
from public.selected_repositories
where user_id = 'a5000000-0000-4000-8000-000000000001'
  and github_repository_id = 960001;

select pg_sleep(0.01);

select lives_ok(
  $$
    select *
    from public.ensure_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      'a5100000-0000-4000-8000-000000000001',
      960001,
      'owner-renamed',
      'repository-renamed',
      'owner-renamed/repository-renamed',
      'internal',
      false,
      true,
      true,
      true,
      'trunk'
    )
  $$,
  'repeat ensure atomically refreshes repository display metadata'
);

select results_eq(
  $$
    select
      current_selection.id = previous_selection.id,
      current_selection.user_id = previous_selection.user_id,
      current_selection.github_installation_id =
        previous_selection.github_installation_id,
      current_selection.github_repository_id =
        previous_selection.github_repository_id,
      current_selection.selected_at = previous_selection.selected_at,
      current_selection.created_at = previous_selection.created_at,
      current_selection.updated_at >= previous_selection.updated_at
    from public.selected_repositories current_selection
    cross join phase_5_selection_before_repeat previous_selection
    where current_selection.user_id =
        'a5000000-0000-4000-8000-000000000001'
      and current_selection.github_repository_id = 960001
  $$,
  $expected$values (true, true, true, true, true, true, true)$expected$,
  'repeat ensure preserves identity and creation timestamps without regressing updated_at'
);

select results_eq(
  $$
    select
      owner_login::text,
      name::text,
      full_name::text,
      visibility,
      is_private,
      is_fork,
      is_archived,
      is_disabled,
      default_branch::text
    from public.selected_repositories
    where user_id = 'a5000000-0000-4000-8000-000000000001'
      and github_repository_id = 960001
  $$,
  $expected$
    values (
      'owner-renamed'::text,
      'repository-renamed'::text,
      'owner-renamed/repository-renamed'::text,
      'internal'::text,
      false,
      true,
      true,
      true,
      'trunk'::text
    )
  $expected$,
  'repeat ensure refreshes exactly the allowed display metadata'
);

select throws_ok(
  $$
    select *
    from public.ensure_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      'a5100000-0000-4000-8000-000000000002',
      960001,
      'attacker',
      'attacker',
      'attacker/attacker',
      'public',
      false,
      false,
      false,
      false,
      'main'
    )
  $$,
  'P0001',
  'github_repository_selection_installation_mismatch',
  'repeat ensure fails closed when the internal installation binding differs'
);

select results_eq(
  $$
    select
      github_installation_id,
      owner_login::text,
      selected_at,
      created_at
    from public.selected_repositories
    where user_id = 'a5000000-0000-4000-8000-000000000001'
      and github_repository_id = 960001
  $$,
  $expected$
    select
      'a5100000-0000-4000-8000-000000000001'::uuid,
      'owner-renamed'::text,
      selected_at,
      created_at
    from phase_5_selection_before_repeat
  $expected$,
  'installation mismatch leaves the original selection unchanged'
);

select lives_ok(
  $$
    select *
    from public.ensure_selected_github_repository(
      'b5000000-0000-4000-8000-000000000002',
      'b5100000-0000-4000-8000-000000000002',
      960001,
      'owner-b',
      'repository-b',
      'owner-b/repository-b',
      'public',
      false,
      false,
      false,
      false,
      'main'
    )
  $$,
  'a different user can independently select the same GitHub repository ID'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$
    select github_repository_id
    from public.selected_repositories
    order by lower(full_name), github_repository_id
  $$,
  array[960001::bigint],
  'authenticated user reads only their own selections through RLS'
);
select throws_ok(
  $$
    insert into public.selected_repositories (
      user_id,
      github_installation_id,
      github_repository_id,
      owner_login,
      name,
      full_name,
      visibility,
      is_private,
      is_fork,
      is_archived,
      is_disabled,
      default_branch
    )
    values (
      'a5000000-0000-4000-8000-000000000001',
      'a5100000-0000-4000-8000-000000000001',
      969999,
      'forged',
      'forged',
      'forged/forged',
      'private',
      true,
      false,
      false,
      false,
      'main'
    )
  $$,
  '42501',
  'permission denied for table selected_repositories',
  'authenticated cannot forge a selection'
);
reset role;

select lives_ok(
  $$
    select public.remove_selected_github_repository(
      'b5000000-0000-4000-8000-000000000002',
      960099
    )
  $$,
  'remove succeeds when the target selection does not exist'
);

update public.github_installations
set
  status = 'revoked',
  revoked_at = now()
where id = 'a5100000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    select public.remove_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      960001
    )
  $$,
  'remove does not depend on installation state'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.selected_repositories
    where user_id = 'a5000000-0000-4000-8000-000000000001'
      and github_repository_id = 960001
  $$,
  array[0::bigint],
  'remove deletes only the requested current-user selection'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.selected_repositories
    where user_id = 'b5000000-0000-4000-8000-000000000002'
      and github_repository_id = 960001
  $$,
  array[1::bigint],
  'removing one user selection does not reveal or delete another user selection'
);

select lives_ok(
  $$
    select public.remove_selected_github_repository(
      'a5000000-0000-4000-8000-000000000001',
      960001
    )
  $$,
  'remove remains idempotent after the row is gone'
);

select * from finish();

rollback;
