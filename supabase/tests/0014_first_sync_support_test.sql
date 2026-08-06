begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public', 'read_first_sync_context', array['uuid'], 'project-scoped first-sync context RPC exists');
select has_function('public', 'get_first_sync_run', array['uuid', 'uuid'], 'project/run read RPC exists');
select has_function(
  'public',
  'checkpoint_first_sync_run',
  array['uuid', 'uuid', 'text', 'bigint', 'timestamp with time zone', 'text'],
  'optimistic first-sync checkpoint RPC exists'
);
select has_function(
  'public',
  'upsert_github_activity_snapshot_group',
  array['uuid', 'text', 'jsonb'],
  'whitelisted group upsert RPC exists'
);

select ok(
  has_function_privilege('service_role', 'public.read_first_sync_context(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.get_first_sync_run(uuid,uuid)', 'execute')
  and has_function_privilege(
    'service_role',
    'public.checkpoint_first_sync_run(uuid,uuid,text,bigint,timestamptz,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.upsert_github_activity_snapshot_group(uuid,text,jsonb)',
    'execute'
  ),
  'service_role receives only controlled Phase 5 RPC execution'
);

select ok(
  not has_function_privilege('anon', 'public.read_first_sync_context(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_first_sync_context(uuid)', 'execute')
  and not has_function_privilege(
    'authenticated',
    'public.checkpoint_first_sync_run(uuid,uuid,text,bigint,timestamptz,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.upsert_github_activity_snapshot_group(uuid,text,jsonb)',
    'execute'
  ),
  'browser roles cannot call Phase 5 RPCs'
);

select ok(
  not has_table_privilege('service_role', 'public.github_repository_snapshots', 'insert,update,delete')
  and not has_table_privilege('service_role', 'public.github_commits', 'insert,update,delete')
  and not has_table_privilege('service_role', 'public.github_issues', 'insert,update,delete')
  and not has_table_privilege('service_role', 'public.github_pull_requests', 'insert,update,delete')
  and not has_table_privilege('service_role', 'public.github_releases', 'insert,update,delete')
  and not has_table_privilege('service_role', 'public.github_workflow_runs', 'insert,update,delete'),
  'Phase 5 does not add direct snapshot table writes'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    'a7500000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase5-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b7500000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'phase5-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('a7500000-0000-4000-8000-000000000001'),
  ('b7500000-0000-4000-8000-000000000002');

insert into public.github_identities (user_id, github_user_id, github_login) values
  ('a7500000-0000-4000-8000-000000000001', 10750001, 'phase5-user-a'),
  ('b7500000-0000-4000-8000-000000000002', 10750002, 'phase5-user-b');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'a7510000-0000-4000-8000-000000000001',
    'a7500000-0000-4000-8000-000000000001',
    10751001, 10750001, 'phase5-user-a', 'User', 'selected', 'active', now()
  ),
  (
    'b7510000-0000-4000-8000-000000000002',
    'b7500000-0000-4000-8000-000000000002',
    10751002, 10750002, 'phase5-user-b', 'User', 'selected', 'active', now()
  );

insert into public.selected_repositories (
  id, user_id, github_installation_id, github_repository_id,
  owner_login, name, full_name, visibility, is_private, is_fork,
  is_archived, is_disabled, default_branch, selected_at, created_at, updated_at
) values
  (
    'a7520000-0000-4000-8000-000000000001',
    'a7500000-0000-4000-8000-000000000001',
    'a7510000-0000-4000-8000-000000000001',
    10752001, 'phase5-user-a', 'alpha', 'phase5-user-a/alpha',
    'private', true, false, false, false, 'main',
    '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z'
  ),
  (
    'b7520000-0000-4000-8000-000000000002',
    'b7500000-0000-4000-8000-000000000002',
    'b7510000-0000-4000-8000-000000000002',
    10752002, 'phase5-user-b', 'beta', 'phase5-user-b/beta',
    'private', true, false, false, false, 'main',
    '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z', '2026-08-05T00:00:00Z'
  );

insert into public.projects (
  id, user_id, selected_repository_id, core_goal, current_stage_goal, status
) values
  (
    'a7530000-0000-4000-8000-000000000001',
    'a7500000-0000-4000-8000-000000000001',
    'a7520000-0000-4000-8000-000000000001',
    'Synthetic Phase 5 A', 'First sync', 'in_development'
  ),
  (
    'b7530000-0000-4000-8000-000000000002',
    'b7500000-0000-4000-8000-000000000002',
    'b7520000-0000-4000-8000-000000000002',
    'Synthetic Phase 5 B', 'First sync', 'in_development'
  );

select is(
  public.read_first_sync_context('a7530000-0000-4000-8000-000000000001')->>'repository_full_name',
  'phase5-user-a/alpha',
  'context binds the explicit Project to its selected repository'
);
select is(
  public.read_first_sync_context('a7530000-0000-4000-8000-000000000001')->>'installation_id',
  '10751001',
  'context carries the stable GitHub installation id'
);
select throws_ok(
  $$ select public.read_first_sync_context('ffffffff-ffff-4fff-8fff-ffffffffffff') $$,
  'P0002', 'first_sync_project_not_found',
  'context rejects an unknown Project'
);

select public.create_sync_run(
  'a7530000-0000-4000-8000-000000000001',
  'first-sync:request-001',
  'first_sync'
);

create temporary table phase5_run as
select id, version from public.sync_runs
where project_id = 'a7530000-0000-4000-8000-000000000001'
  and idempotency_key = 'first-sync:request-001';

select is(
  public.get_first_sync_run(
    'a7530000-0000-4000-8000-000000000001',
    (select id from phase5_run)
  )->>'project_id',
  'a7530000-0000-4000-8000-000000000001',
  'run read requires matching project lineage'
);
select is(
  public.get_first_sync_run(
    'b7530000-0000-4000-8000-000000000002',
    (select id from phase5_run)
  ),
  null,
  'cross-Project run read returns no row'
);

create temporary table phase5_cursor as
select jsonb_build_object(
  'version', 'first-sync-cursor.v1',
  'readerContractVersion', 'github-activity-reader.v1',
  'snapshotContractVersion', 'github-activity-snapshots.v1',
  'syncStateContractVersion', 'synchronization-state.v1',
  'projectId', 'a7530000-0000-4000-8000-000000000001',
  'syncRunId', (select id::text from phase5_run),
  'requestId', 'request-001',
  'repositoryFullName', 'phase5-user-a/alpha',
  'installationId', 10751001,
  'windowStart', '2026-05-08T02:00:00.000Z',
  'windowEnd', '2026-08-06T02:00:00.000Z',
  'job', jsonb_build_object(
    'jobId', (select id::text from phase5_run),
    'correlationId', 'first-sync:' || (select id::text from phase5_run),
    'idempotencyKey', 'first-sync:request-001',
    'providerJobId', 'provider-event-001'
  ),
  'completedGroups', '[]'::jsonb,
  'failedGroup', null
)::text as value;

select is(
  public.checkpoint_first_sync_run(
    'a7530000-0000-4000-8000-000000000001',
    (select id from phase5_run),
    'queued', 1,
    (select queued_at from public.sync_runs where id = (select id from phase5_run)),
    (select value from phase5_cursor)
  )->>'version',
  '2',
  'checkpoint atomically writes the cursor and increments version'
);

select throws_ok(
  $$ select public.checkpoint_first_sync_run(
    'a7530000-0000-4000-8000-000000000001',
    (select id from phase5_run), 'queued', 1,
    (select queued_at + interval '1 minute' from public.sync_runs where id = (select id from phase5_run)),
    (select value from phase5_cursor)
  ) $$,
  'P0001', 'sync_run_concurrency_conflict',
  'stale checkpoint cannot overwrite a newer version'
);

select throws_ok(
  $$ select public.checkpoint_first_sync_run(
    'a7530000-0000-4000-8000-000000000001',
    (select id from phase5_run), 'queued', 2,
    (select queued_at + interval '1 minute' from public.sync_runs where id = (select id from phase5_run)),
    ((select value::jsonb from phase5_cursor) || '{"token":"forbidden"}'::jsonb)::text
  ) $$,
  'P0001', 'first_sync_cursor_invalid',
  'checkpoint rejects a cursor with a non-whitelisted sensitive key'
);

select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'repository',
    '[{"githubObjectId":"10752001","sourceUpdatedAt":"2026-08-05T00:00:00.000Z","sourceVersion":"2026-08-05T00:00:00.000Z","repositoryFullName":"phase5-user-a/alpha","defaultBranch":"main","visibility":"private","isPrivate":true,"isFork":false,"isArchived":false,"isDisabled":false}]'::jsonb
  ) $$,
  'repository metadata upsert succeeds'
);
select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'commit',
    '[{"githubObjectId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceUpdatedAt":"2026-06-01T00:00:00.000Z","sourceVersion":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Synthetic commit","authoredAt":null,"committedAt":"2026-06-01T00:00:00.000Z","authorLogin":null}]'::jsonb
  ) $$,
  'commit group upsert succeeds'
);
select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'issue',
    '[{"githubObjectId":"91001","sourceUpdatedAt":"2026-06-02T00:00:00.000Z","sourceVersion":"2026-06-02T00:00:00.000Z","number":1,"title":"Synthetic issue","state":"open","authorLogin":null,"closedAt":null}]'::jsonb
  ) $$,
  'issue group upsert succeeds'
);
select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'pull_request',
    '[{"githubObjectId":"92001","sourceUpdatedAt":"2026-06-03T00:00:00.000Z","sourceVersion":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","number":2,"title":"Synthetic PR","state":"closed","isDraft":false,"headSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","baseRef":"main","mergedAt":"2026-06-04T00:00:00.000Z"}]'::jsonb
  ) $$,
  'pull request group upsert succeeds'
);
select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'release',
    '[{"githubObjectId":"93001","sourceUpdatedAt":"2026-06-05T00:00:00.000Z","sourceVersion":"2026-06-05T00:00:00.000Z","tagName":"v1.0.0","name":null,"isDraft":false,"isPrerelease":false,"publishedAt":"2026-06-05T00:00:00.000Z"}]'::jsonb
  ) $$,
  'release group upsert succeeds'
);
select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'workflow_run',
    '[{"githubObjectId":"94001","sourceUpdatedAt":"2026-06-06T00:00:00.000Z","sourceVersion":"cccccccccccccccccccccccccccccccccccccccc:1:2026-06-06T00:00:00.000Z","workflowId":"95001","runNumber":3,"status":"completed","conclusion":"success","eventName":"push","headSha":"cccccccccccccccccccccccccccccccccccccccc"}]'::jsonb
  ) $$,
  'workflow run group upsert succeeds'
);

select results_eq(
  $$ select count(*)::bigint from public.github_commits
     where project_id = 'a7530000-0000-4000-8000-000000000001'
       and github_object_id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' $$,
  array[1::bigint],
  'one project/object produces one snapshot record'
);

select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'commit',
    '[{"githubObjectId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceUpdatedAt":"2026-06-01T00:00:00.000Z","sourceVersion":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Synthetic replay","authoredAt":null,"committedAt":"2026-06-01T00:00:00.000Z","authorLogin":null}]'::jsonb
  ) $$,
  'same project/object replay is an idempotent upsert'
);
select results_eq(
  $$ select count(*)::bigint from public.github_commits
     where project_id = 'a7530000-0000-4000-8000-000000000001'
       and github_object_id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' $$,
  array[1::bigint],
  'replay does not inflate the unique snapshot count'
);

select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'commit',
    '[{"githubObjectId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceUpdatedAt":"2026-06-02T00:00:00.000Z","sourceVersion":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Newest fact","authoredAt":null,"committedAt":"2026-06-02T00:00:00.000Z","authorLogin":null}]'::jsonb
  ) $$,
  'a newer source fact advances the existing snapshot'
);
select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'commit',
    '[{"githubObjectId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceUpdatedAt":"2026-05-20T00:00:00.000Z","sourceVersion":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Stale replay","authoredAt":null,"committedAt":"2026-05-20T00:00:00.000Z","authorLogin":null}]'::jsonb
  ) $$,
  'an older replay remains an idempotent no-op'
);
select results_eq(
  $$ select source_updated_at, message from public.github_commits
     where project_id = 'a7530000-0000-4000-8000-000000000001'
       and github_object_id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' $$,
  $$ values ('2026-06-02T00:00:00Z'::timestamptz, 'Newest fact'::text) $$,
  'an older replay cannot roll back a newer source version'
);

select lives_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'b7530000-0000-4000-8000-000000000002', 'commit',
    '[{"githubObjectId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceUpdatedAt":"2026-06-01T00:00:00.000Z","sourceVersion":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message":"Independent project","authoredAt":null,"committedAt":"2026-06-01T00:00:00.000Z","authorLogin":null}]'::jsonb
  ) $$,
  'the same object id is independent across Projects'
);
select results_eq(
  $$ select count(*)::bigint from public.github_commits
     where github_object_id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' $$,
  array[2::bigint],
  'cross-Project object identity does not collide'
);

select throws_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'check', '[]'::jsonb
  ) $$,
  'P0001', 'github_activity_snapshot_write_invalid',
  'Check cannot be persisted without a Phase 1 table'
);
select throws_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'a7530000-0000-4000-8000-000000000001', 'commit',
    '[{"githubObjectId":"dddddddddddddddddddddddddddddddddddddddd","sourceUpdatedAt":"2026-06-01T00:00:00.000Z","sourceVersion":"dddddddddddddddddddddddddddddddddddddddd","message":"Bad payload","authoredAt":null,"committedAt":"2026-06-01T00:00:00.000Z","authorLogin":null,"rawPayload":{}}]'::jsonb
  ) $$,
  'P0001', 'github_activity_snapshot_write_invalid',
  'snapshot RPC rejects a non-whitelisted raw payload field'
);
select throws_ok(
  $$ select public.upsert_github_activity_snapshot_group(
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'commit', '[]'::jsonb
  ) $$,
  'P0002', 'sync_run_project_not_found',
  'snapshot RPC rejects an unknown Project'
);

select * from finish();
rollback;
