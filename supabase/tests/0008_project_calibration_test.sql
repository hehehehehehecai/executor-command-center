begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'projects', 'projects table exists');
select columns_are(
  'public',
  'projects',
  array[
    'id',
    'user_id',
    'selected_repository_id',
    'core_goal',
    'current_stage_goal',
    'status',
    'current_blocker',
    'created_at',
    'updated_at'
  ],
  'projects stores only internal lineage, four calibration fields and timestamps'
);
select results_eq(
  $$
    select indexname::text collate "default"
    from pg_indexes
    where schemaname = 'public' and tablename = 'projects'
    order by indexname
  $$,
  array[
    'projects_one_active_per_selected_repository_idx',
    'projects_pkey',
    'projects_user_sort_idx'
  ],
  'project indexes include the partial active uniqueness boundary'
);
select results_eq(
  $$
    select pg_get_indexdef(indexrelid)
    from pg_index
    join pg_class on pg_class.oid = pg_index.indexrelid
    where pg_class.relname = 'projects_one_active_per_selected_repository_idx'
  $$,
  array[
    'CREATE UNIQUE INDEX projects_one_active_per_selected_repository_idx ON public.projects USING btree (selected_repository_id) WHERE (status <> ''archived''::text)'
  ],
  'one non-archived project per selected repository is database-enforced'
);
select results_eq(
  $$
    select relrowsecurity from pg_class where oid = 'public.projects'::regclass
  $$,
  array[true],
  'projects has RLS enabled'
);
select policies_are(
  'public',
  'projects',
  array['projects_select_own'],
  'projects exposes only own-row read'
);
select ok(
  not has_table_privilege('anon', 'public.projects', 'select')
    and not has_table_privilege('authenticated', 'public.projects', 'insert')
    and not has_table_privilege('authenticated', 'public.projects', 'update')
    and not has_table_privilege('authenticated', 'public.projects', 'delete')
    and not has_table_privilege('service_role', 'public.projects', 'insert')
    and not has_table_privilege('service_role', 'public.projects', 'update')
    and not has_table_privilege('service_role', 'public.projects', 'delete'),
  'anon, authenticated and service_role have no forbidden project table privileges'
);
select ok(
  has_table_privilege('authenticated', 'public.projects', 'select'),
  'authenticated reads projects through RLS'
);
select has_function(
  'public',
  'save_project_calibration',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text'],
  'atomic project calibration RPC exists'
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
      and procedure_record.proname = 'save_project_calibration'
  $$,
  $expected$values ('postgres'::text, true, 'search_path=""'::text)$expected$,
  'RPC is postgres-owned security definer with empty search_path'
);
select ok(
  not has_function_privilege(
    'public',
    'public.save_project_calibration(uuid,uuid,text,text,text,text)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.save_project_calibration(uuid,uuid,text,text,text,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.save_project_calibration(uuid,uuid,text,text,text,text)',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'public.save_project_calibration(uuid,uuid,text,text,text,text)',
      'execute'
    ),
  'only postgres and service_role can execute the write RPC'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_proc procedure_record
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'save_project_calibration'
      and (
        lower(pg_get_functiondef(procedure_record.oid)) like '%execute %'
        or lower(pg_get_functiondef(procedure_record.oid)) like '%format(%'
      )
  $$,
  array[0::bigint],
  'RPC contains no dynamic SQL'
);
select results_eq(
  $$
    select procedure_record.proname::text collate "default"
    from pg_trigger trigger_record
    join pg_proc procedure_record on procedure_record.oid = trigger_record.tgfoid
    join pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where trigger_record.tgrelid = 'public.projects'::regclass
      and not trigger_record.tgisinternal
      and namespace_record.nspname = 'app_private'
  $$,
  array['set_updated_at'],
  'projects reuses app_private.set_updated_at'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a6000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase6-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b6000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase6-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );
insert into public.users (id) values
  ('a6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000002');
insert into public.github_identities (user_id, github_user_id, github_login) values
  ('a6000000-0000-4000-8000-000000000001', 960001, 'phase6-user-a'),
  ('b6000000-0000-4000-8000-000000000002', 960002, 'phase6-user-b');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'a6100000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000001',
    961001, 960001, 'phase6-user-a', 'User', 'selected', 'active', now()
  ),
  (
    'b6100000-0000-4000-8000-000000000002',
    'b6000000-0000-4000-8000-000000000002',
    961002, 960002, 'phase6-user-b', 'User', 'selected', 'active', now()
  );
select public.ensure_selected_github_repository(
  'a6000000-0000-4000-8000-000000000001',
  'a6100000-0000-4000-8000-000000000001',
  970001, 'synthetic-a', 'alpha', 'synthetic-a/alpha',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'a6000000-0000-4000-8000-000000000001',
  'a6100000-0000-4000-8000-000000000001',
  970002, 'synthetic-a', 'beta', 'synthetic-a/beta',
  'public', false, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'b6000000-0000-4000-8000-000000000002',
  'b6100000-0000-4000-8000-000000000002',
  970003, 'synthetic-b', 'gamma', 'synthetic-b/gamma',
  'private', true, false, false, false, 'trunk'
);

select throws_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'Goal', 'Stage', 'in_planning', null
    )
  $$,
  'P0002',
  'project_calibration_selected_repository_not_found',
  'missing repository fails closed'
);
select throws_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970003),
      'Goal', 'Stage', 'in_planning', null
    )
  $$,
  'P0001',
  'project_calibration_selected_repository_wrong_user',
  'cross-user repository fails closed'
);

select lives_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970001),
      'Goal', 'Stage', 'in_planning', null
    )
  $$,
  'creates one active project'
);
select results_eq(
  $$
    select count(*)::bigint from public.projects
    where selected_repository_id = (
      select id from public.selected_repositories where github_repository_id = 970001
    ) and status <> 'archived'
  $$,
  array[1::bigint],
  'one active project exists'
);
select lives_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970001),
      'Updated goal', 'Updated stage', 'in_development', 'No blocker'
    )
  $$,
  'repeat save updates instead of multiplying active projects'
);
select results_eq(
  $$
    select core_goal || '|' || current_stage_goal || '|' || status || '|' || current_blocker
    from public.projects
    where selected_repository_id = (
      select id from public.selected_repositories where github_repository_id = 970001
    ) and status <> 'archived'
  $$,
  array['Updated goal|Updated stage|in_development|No blocker'],
  'repeat save preserves exact user statements'
);
select throws_ok(
  $$
    insert into public.projects (
      user_id, selected_repository_id, core_goal, current_stage_goal, status
    ) values (
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970001),
      'Second', 'Second', 'polishing'
    )
  $$,
  '23505',
  null,
  'partial unique index rejects a concurrent second active project'
);
select lives_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970001),
      'Archived goal', 'Archived stage', 'archived', null
    )
  $$,
  'active project can be archived'
);
select throws_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970001),
      'Archived goal', 'Archived stage', 'archived', null
    )
  $$,
  'P0001',
  'project_calibration_conflict',
  'repeated archive without an active project is rejected'
);
select results_eq(
  $$
    select count(*)::bigint from public.projects
    where selected_repository_id = (
      select id from public.selected_repositories where github_repository_id = 970001
    ) and status = 'archived'
  $$,
  array[1::bigint],
  'repeated archive does not create ghost history'
);
select lives_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970001),
      'Replacement goal', 'Replacement stage', 'in_planning', null
    )
  $$,
  'archived history permits a new active project'
);
select results_eq(
  $$
    select status, count(*)::bigint
    from public.projects
    where selected_repository_id = (
      select id from public.selected_repositories where github_repository_id = 970001
    )
    group by status order by status
  $$,
  $expected$
    values ('archived'::text, 1::bigint), ('in_planning'::text, 1::bigint)
  $expected$,
  'archived history is retained beside one replacement active project'
);
select lives_ok(
  $$
    select public.save_project_calibration(
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970002),
      'Other repository', 'Independent stage', 'completed', null
    )
  $$,
  'different selected repositories calibrate independently'
);
select throws_ok(
  $$
    select public.remove_selected_github_repository(
      'a6000000-0000-4000-8000-000000000001',
      970001
    )
  $$,
  'P0001',
  'github_repository_selection_active_project_conflict',
  'active project blocks repository deselection'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a6000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select count(*)::bigint from public.projects$$,
  array[3::bigint],
  'authenticated user reads only own projects through RLS'
);
select throws_ok(
  $$
    insert into public.projects (
      user_id, selected_repository_id, core_goal, current_stage_goal, status
    ) values (
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970002),
      'Forged', 'Forged', 'dormant'
    )
  $$,
  '42501',
  'permission denied for table projects',
  'authenticated cannot write projects directly'
);
reset role;

select throws_ok(
  $$
    insert into public.projects (
      user_id, selected_repository_id, core_goal, current_stage_goal, status
    ) values (
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970002),
      ' leading', 'Stage', 'dormant'
    )
  $$,
  '23514',
  null,
  'database rejects leading whitespace'
);
select throws_ok(
  $$
    insert into public.projects (
      user_id, selected_repository_id, core_goal, current_stage_goal, status
    ) values (
      'a6000000-0000-4000-8000-000000000001',
      (select id from public.selected_repositories where github_repository_id = 970002),
      repeat('🚀', 1001), 'Stage', 'dormant'
    )
  $$,
  '23514',
  null,
  'database enforces JavaScript UTF-16 code unit length'
);

select * from finish();
rollback;
