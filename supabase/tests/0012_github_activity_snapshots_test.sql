begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create temporary table snapshot_table_contracts (
  table_name text primary key
) on commit drop;

insert into snapshot_table_contracts (table_name) values
  ('github_repository_snapshots'),
  ('github_commits'),
  ('github_issues'),
  ('github_pull_requests'),
  ('github_releases'),
  ('github_workflow_runs'),
  ('github_document_snapshots');

select has_table(
  'public',
  table_name,
  format('%s exists as an independent snapshot table', table_name)
)
from snapshot_table_contracts
order by table_name;

select has_column(
  'public',
  table_name,
  'project_id',
  format('%s carries Project lineage', table_name)
)
from snapshot_table_contracts
order by table_name;

select has_column(
  'public',
  table_name,
  'github_object_id',
  format('%s carries a stable GitHub object identity', table_name)
)
from snapshot_table_contracts
order by table_name;

select has_column(
  'public',
  table_name,
  'source_updated_at',
  format('%s carries a source timestamp', table_name)
)
from snapshot_table_contracts
order by table_name;

select has_column(
  'public',
  table_name,
  'source_version',
  format('%s carries a controlled source version', table_name)
)
from snapshot_table_contracts
order by table_name;

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    join pg_class table_record
      on table_record.oid = constraint_record.conrelid
    join pg_namespace namespace_record
      on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = 'public'
      and table_record.relname in (
        select table_name from snapshot_table_contracts
      )
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid)
        ~ '^UNIQUE \(project_id, github_object_id\)$'
  $$,
  array[7::bigint],
  'all seven tables enforce project plus stable-object idempotency'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    join pg_class table_record
      on table_record.oid = constraint_record.conrelid
    join pg_namespace namespace_record
      on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = 'public'
      and table_record.relname in (
        select table_name from snapshot_table_contracts
      )
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.projects'::regclass
      and constraint_record.confdeltype = 'c'
  $$,
  array[7::bigint],
  'all seven Project foreign keys cascade with the Project lifecycle'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class table_record
    join pg_namespace namespace_record
      on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = 'public'
      and table_record.relname in (
        select table_name from snapshot_table_contracts
      )
      and table_record.relrowsecurity
  $$,
  array[7::bigint],
  'all seven snapshot tables enable RLS'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename in (
        select table_name from snapshot_table_contracts
      )
      and policy_record.cmd = 'SELECT'
      and policy_record.roles = array['authenticated']::name[]
  $$,
  array[7::bigint],
  'all seven tables expose exactly one authenticated read policy'
);

select ok(
  not exists (
    select 1
    from snapshot_table_contracts contract_record
    where not has_table_privilege(
      'authenticated',
      format('public.%I', contract_record.table_name),
      'select'
    )
  ),
  'authenticated receives select on every snapshot table'
);

select ok(
  not exists (
    select 1
    from snapshot_table_contracts contract_record
    where has_table_privilege(
      'anon',
      format('public.%I', contract_record.table_name),
      'select,insert,update,delete'
    )
      or has_table_privilege(
        'authenticated',
        format('public.%I', contract_record.table_name),
        'insert,update,delete'
      )
      or has_table_privilege(
        'service_role',
        format('public.%I', contract_record.table_name),
        'insert,update,delete'
      )
  ),
  'browser and service roles have no direct snapshot writes'
);

select results_eq(
  $$
    select count(*)::bigint
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name in (
        select table_name from snapshot_table_contracts
      )
      and column_record.column_name
        ~* 'raw_(response|payload)|api_(response|payload)'
  $$,
  array[0::bigint],
  'no snapshot table stores a raw API response as a business column'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_trigger trigger_record
    join pg_class table_record
      on table_record.oid = trigger_record.tgrelid
    join pg_namespace namespace_record
      on namespace_record.oid = table_record.relnamespace
    join pg_proc procedure_record
      on procedure_record.oid = trigger_record.tgfoid
    join pg_namespace procedure_namespace
      on procedure_namespace.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and table_record.relname in (
        select table_name from snapshot_table_contracts
      )
      and not trigger_record.tgisinternal
      and procedure_namespace.nspname = 'app_private'
      and procedure_record.proname = 'set_updated_at'
  $$,
  array[7::bigint],
  'all seven tables reuse the established updated-at trigger'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'a7100000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'stage3-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b7100000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'stage3-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('a7100000-0000-4000-8000-000000000001'),
  ('b7100000-0000-4000-8000-000000000002');

insert into public.github_identities (
  user_id, github_user_id, github_login
) values
  ('a7100000-0000-4000-8000-000000000001', 10710001, 'stage3-user-a'),
  ('b7100000-0000-4000-8000-000000000002', 10710002, 'stage3-user-b');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'a7110000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    10711001, 10710001, 'stage3-user-a', 'User', 'selected', 'active', now()
  ),
  (
    'b7110000-0000-4000-8000-000000000002',
    'b7100000-0000-4000-8000-000000000002',
    10711002, 10710002, 'stage3-user-b', 'User', 'selected', 'active', now()
  );

insert into public.selected_repositories (
  id, user_id, github_installation_id, github_repository_id,
  owner_login, name, full_name, visibility, is_private, is_fork,
  is_archived, is_disabled, default_branch
) values
  (
    'a7120000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7110000-0000-4000-8000-000000000001',
    10712001, 'stage3-user-a', 'alpha', 'stage3-user-a/alpha',
    'private', true, false, false, false, 'main'
  ),
  (
    'a7120000-0000-4000-8000-000000000002',
    'a7100000-0000-4000-8000-000000000001',
    'a7110000-0000-4000-8000-000000000001',
    10712002, 'stage3-user-a', 'beta', 'stage3-user-a/beta',
    'private', true, false, false, false, 'main'
  ),
  (
    'b7120000-0000-4000-8000-000000000003',
    'b7100000-0000-4000-8000-000000000002',
    'b7110000-0000-4000-8000-000000000002',
    10712003, 'stage3-user-b', 'gamma', 'stage3-user-b/gamma',
    'private', true, false, false, false, 'main'
  );

insert into public.projects (
  id, user_id, selected_repository_id, core_goal,
  current_stage_goal, status
) values
  (
    'a7130000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'a7120000-0000-4000-8000-000000000001',
    'Synthetic A1 goal', 'Task 1', 'in_development'
  ),
  (
    'a7130000-0000-4000-8000-000000000002',
    'a7100000-0000-4000-8000-000000000001',
    'a7120000-0000-4000-8000-000000000002',
    'Synthetic A2 goal', 'Task 1', 'in_development'
  ),
  (
    'b7130000-0000-4000-8000-000000000003',
    'b7100000-0000-4000-8000-000000000002',
    'b7120000-0000-4000-8000-000000000003',
    'Synthetic B goal', 'Task 1', 'in_development'
  );

insert into public.github_repository_snapshots (
  project_id, github_object_id, repository_full_name, default_branch,
  visibility, is_private, is_fork, is_archived, is_disabled,
  source_updated_at, source_version
)
select project_id, 'shared-object', 'synthetic/repository', 'main',
  'private', true, false, false, false, now(), 'repository-node-v1'
from (
  values
    ('a7130000-0000-4000-8000-000000000001'::uuid),
    ('a7130000-0000-4000-8000-000000000002'::uuid),
    ('b7130000-0000-4000-8000-000000000003'::uuid)
) fixture(project_id);

insert into public.github_commits (
  project_id, github_object_id, message, authored_at, committed_at,
  author_login, source_updated_at, source_version
)
select project_id, 'shared-object', 'Synthetic commit', now(), now(),
  'fixture-author', now(), 'tree-sha-v1'
from (
  values
    ('a7130000-0000-4000-8000-000000000001'::uuid),
    ('a7130000-0000-4000-8000-000000000002'::uuid),
    ('b7130000-0000-4000-8000-000000000003'::uuid)
) fixture(project_id);

insert into public.github_issues (
  project_id, github_object_id, issue_number, title, state,
  author_login, source_updated_at, source_version
)
select project_id, 'shared-object', 1, 'Synthetic issue', 'open',
  'fixture-author', now(), 'issue-node-v1'
from (
  values
    ('a7130000-0000-4000-8000-000000000001'::uuid),
    ('a7130000-0000-4000-8000-000000000002'::uuid),
    ('b7130000-0000-4000-8000-000000000003'::uuid)
) fixture(project_id);

insert into public.github_pull_requests (
  project_id, github_object_id, pull_request_number, title, state,
  is_draft, head_sha, base_ref, source_updated_at, source_version
)
select project_id, 'shared-object', 1, 'Synthetic pull request', 'open',
  false, 'head-sha-v1', 'main', now(), 'pull-request-node-v1'
from (
  values
    ('a7130000-0000-4000-8000-000000000001'::uuid),
    ('a7130000-0000-4000-8000-000000000002'::uuid),
    ('b7130000-0000-4000-8000-000000000003'::uuid)
) fixture(project_id);

insert into public.github_releases (
  project_id, github_object_id, tag_name, name, is_draft,
  is_prerelease, published_at, source_updated_at, source_version
)
select project_id, 'shared-object', 'v1.0.0', 'Synthetic release', false,
  false, now(), now(), 'release-node-v1'
from (
  values
    ('a7130000-0000-4000-8000-000000000001'::uuid),
    ('a7130000-0000-4000-8000-000000000002'::uuid),
    ('b7130000-0000-4000-8000-000000000003'::uuid)
) fixture(project_id);

insert into public.github_workflow_runs (
  project_id, github_object_id, workflow_id, run_number, status,
  conclusion, event_name, head_sha, source_updated_at, source_version
)
select project_id, 'shared-object', 'workflow-1', 1, 'completed',
  'success', 'push', 'head-sha-v1', now(), 'workflow-run-node-v1'
from (
  values
    ('a7130000-0000-4000-8000-000000000001'::uuid),
    ('a7130000-0000-4000-8000-000000000002'::uuid),
    ('b7130000-0000-4000-8000-000000000003'::uuid)
) fixture(project_id);

insert into public.github_document_snapshots (
  project_id, github_object_id, document_path, document_kind,
  content_fingerprint, source_updated_at, source_version
)
select project_id, 'shared-object', 'README.md', 'readme',
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  now(), 'blob-sha-v1'
from (
  values
    ('a7130000-0000-4000-8000-000000000001'::uuid),
    ('a7130000-0000-4000-8000-000000000002'::uuid),
    ('b7130000-0000-4000-8000-000000000003'::uuid)
) fixture(project_id);

select results_eq(
  format(
    'select count(*)::bigint from public.%I where github_object_id = ''shared-object''',
    table_name
  ),
  array[3::bigint],
  format('%s permits the same GitHub object id across Projects', table_name)
)
from snapshot_table_contracts
order by table_name;

select throws_ok(
  format(
    'insert into public.%1$I select gen_random_uuid(), project_id, github_object_id, source_updated_at, source_version, created_at, updated_at, %2$s from public.%1$I where project_id = ''a7130000-0000-4000-8000-000000000001'' limit 1',
    table_name,
    case table_name
      when 'github_repository_snapshots' then 'repository_full_name, default_branch, visibility, is_private, is_fork, is_archived, is_disabled'
      when 'github_commits' then 'message, authored_at, committed_at, author_login'
      when 'github_issues' then 'issue_number, title, state, author_login, closed_at'
      when 'github_pull_requests' then 'pull_request_number, title, state, is_draft, head_sha, base_ref, merged_at'
      when 'github_releases' then 'tag_name, name, is_draft, is_prerelease, published_at'
      when 'github_workflow_runs' then 'workflow_id, run_number, status, conclusion, event_name, head_sha'
      when 'github_document_snapshots' then 'document_path, document_kind, content_fingerprint'
    end
  ),
  '23505',
  null,
  format('%s rejects a duplicate object inside one Project', table_name)
)
from snapshot_table_contracts
order by table_name;

select throws_ok(
  format(
    'insert into public.%1$I select gen_random_uuid(), ''ffffffff-ffff-4fff-8fff-ffffffffffff''::uuid, github_object_id, source_updated_at, source_version, created_at, updated_at, %2$s from public.%1$I limit 1',
    table_name,
    case table_name
      when 'github_repository_snapshots' then 'repository_full_name, default_branch, visibility, is_private, is_fork, is_archived, is_disabled'
      when 'github_commits' then 'message, authored_at, committed_at, author_login'
      when 'github_issues' then 'issue_number, title, state, author_login, closed_at'
      when 'github_pull_requests' then 'pull_request_number, title, state, is_draft, head_sha, base_ref, merged_at'
      when 'github_releases' then 'tag_name, name, is_draft, is_prerelease, published_at'
      when 'github_workflow_runs' then 'workflow_id, run_number, status, conclusion, event_name, head_sha'
      when 'github_document_snapshots' then 'document_path, document_kind, content_fingerprint'
    end
  ),
  '23503',
  null,
  format('%s rejects an unknown Project', table_name)
)
from snapshot_table_contracts
order by table_name;

select throws_ok(
  format(
    'insert into public.%1$I select gen_random_uuid(), project_id, '' '', source_updated_at, source_version, created_at, updated_at, %2$s from public.%1$I where project_id = ''a7130000-0000-4000-8000-000000000001'' limit 1',
    table_name,
    case table_name
      when 'github_repository_snapshots' then 'repository_full_name, default_branch, visibility, is_private, is_fork, is_archived, is_disabled'
      when 'github_commits' then 'message, authored_at, committed_at, author_login'
      when 'github_issues' then 'issue_number, title, state, author_login, closed_at'
      when 'github_pull_requests' then 'pull_request_number, title, state, is_draft, head_sha, base_ref, merged_at'
      when 'github_releases' then 'tag_name, name, is_draft, is_prerelease, published_at'
      when 'github_workflow_runs' then 'workflow_id, run_number, status, conclusion, event_name, head_sha'
      when 'github_document_snapshots' then 'document_path, document_kind, content_fingerprint'
    end
  ),
  '23514',
  null,
  format('%s rejects a blank stable object id', table_name)
)
from snapshot_table_contracts
order by table_name;

grant select on snapshot_table_contracts to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a7100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  format('select count(*)::bigint from public.%I', table_name),
  array[2::bigint],
  format('%s exposes only user A Project rows', table_name)
)
from snapshot_table_contracts
order by table_name;

select throws_ok(
  format(
    'insert into public.%I (project_id, github_object_id, source_updated_at, source_version) values (''a7130000-0000-4000-8000-000000000001'', ''forged'', now(), ''forged'')',
    table_name
  ),
  '42501',
  null,
  format('authenticated cannot write %s directly', table_name)
)
from snapshot_table_contracts
order by table_name;

reset role;

delete from public.projects
where id = 'a7130000-0000-4000-8000-000000000002';

select results_eq(
  format(
    'select count(*)::bigint from public.%I where project_id = ''a7130000-0000-4000-8000-000000000002''',
    table_name
  ),
  array[0::bigint],
  format('%s cascades when its Project is deleted', table_name)
)
from snapshot_table_contracts
order by table_name;

select * from finish();
rollback;
