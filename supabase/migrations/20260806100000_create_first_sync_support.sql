-- logical_migration_id: 0012
-- contract_versions: first-repository-sync.v1, first-sync-groups.v1,
--                    first-sync-window-90d.v1, first-sync-cursor.v1,
--                    github-activity-snapshot-writer.v1
-- purpose: provide project-scoped, service-role-only first-sync context,
--          cursor checkpoints and typed snapshot group upserts

create function app_private.first_sync_cursor_is_valid(
  cursor_value text,
  expected_project_id uuid,
  expected_run_id uuid
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  cursor_document jsonb;
  job_document jsonb;
  failure_document jsonb;
begin
  if char_length(cursor_value) > 2000 then return false; end if;
  begin
    cursor_document := cursor_value::jsonb;
  exception when others then
    return false;
  end;

  if jsonb_typeof(cursor_document) <> 'object'
    or (select count(*) from jsonb_object_keys(cursor_document)) <> 14
    or not cursor_document ?& array[
      'version', 'readerContractVersion', 'snapshotContractVersion',
      'syncStateContractVersion', 'projectId', 'syncRunId', 'requestId',
      'repositoryFullName', 'installationId', 'windowStart', 'windowEnd',
      'job', 'completedGroups', 'failedGroup'
    ]
    or cursor_document->>'version' <> 'first-sync-cursor.v1'
    or cursor_document->>'readerContractVersion' <> 'github-activity-reader.v1'
    or cursor_document->>'snapshotContractVersion' <> 'github-activity-snapshots.v1'
    or cursor_document->>'syncStateContractVersion' <> 'synchronization-state.v1'
    or cursor_document->>'projectId' <> expected_project_id::text
    or cursor_document->>'syncRunId' <> expected_run_id::text
    or coalesce(cursor_document->>'requestId', '')
      !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    or coalesce(cursor_document->>'repositoryFullName', '') = ''
    or char_length(cursor_document->>'repositoryFullName') > 512
    or jsonb_typeof(cursor_document->'installationId') <> 'number'
    or (cursor_document->>'installationId')::bigint <= 0
    or coalesce(cursor_document->>'windowStart', '')
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or coalesce(cursor_document->>'windowEnd', '')
      !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or jsonb_typeof(cursor_document->'job') <> 'object'
    or jsonb_typeof(cursor_document->'completedGroups') <> 'array'
  then
    return false;
  end if;

  job_document := cursor_document->'job';
  if (select count(*) from jsonb_object_keys(job_document)) <> 4
    or not job_document ?& array[
      'jobId', 'correlationId', 'idempotencyKey', 'providerJobId'
    ]
    or job_document->>'jobId' <> expected_run_id::text
    or coalesce(job_document->>'correlationId', '')
      !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'
    or coalesce(job_document->>'idempotencyKey', '')
      !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'
    or coalesce(job_document->>'providerJobId', '')
      !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'
  then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(cursor_document->'completedGroups')
      with ordinality completed_group(group_name, position)
    where completed_group.position > 6
      or completed_group.group_name is distinct from (
        array['repository', 'commit', 'issue', 'pull_request', 'release', 'workflow_run']
      )[completed_group.position]
  ) then
    return false;
  end if;

  if jsonb_typeof(cursor_document->'failedGroup') = 'null' then
    return true;
  end if;
  if jsonb_typeof(cursor_document->'failedGroup') <> 'object' then
    return false;
  end if;
  failure_document := cursor_document->'failedGroup';
  if (select count(*) from jsonb_object_keys(failure_document)) <> 3
    or not failure_document ?& array['groupName', 'code', 'retryable']
    or failure_document->>'groupName' not in (
      'repository', 'commit', 'issue', 'pull_request', 'release', 'workflow_run'
    )
    or coalesce(failure_document->>'code', '')
      !~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    or char_length(failure_document->>'code') > 128
    or jsonb_typeof(failure_document->'retryable') <> 'boolean'
  then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

alter function app_private.first_sync_cursor_is_valid(text, uuid, uuid)
owner to postgres;
revoke all on function app_private.first_sync_cursor_is_valid(text, uuid, uuid)
from public, anon, authenticated, service_role;

create function public.read_first_sync_context(p_project_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  context_record record;
begin
  select
    project_record.id as project_id,
    selection_record.github_repository_id,
    selection_record.owner_login,
    selection_record.name as repository_name,
    selection_record.full_name as repository_full_name,
    selection_record.visibility,
    selection_record.is_private,
    selection_record.is_fork,
    selection_record.is_archived,
    selection_record.is_disabled,
    selection_record.default_branch,
    selection_record.updated_at as repository_updated_at,
    installation_record.installation_id,
    installation_record.status as installation_status
  into context_record
  from public.projects project_record
  join public.selected_repositories selection_record
    on selection_record.id = project_record.selected_repository_id
    and selection_record.user_id = project_record.user_id
  join public.github_installations installation_record
    on installation_record.id = selection_record.github_installation_id
    and installation_record.user_id = project_record.user_id
  where project_record.id = p_project_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'first_sync_project_not_found';
  end if;

  return jsonb_build_object(
    'project_id', context_record.project_id,
    'github_repository_id', context_record.github_repository_id,
    'owner_login', context_record.owner_login,
    'repository_name', context_record.repository_name,
    'repository_full_name', context_record.repository_full_name,
    'visibility', context_record.visibility,
    'is_private', context_record.is_private,
    'is_fork', context_record.is_fork,
    'is_archived', context_record.is_archived,
    'is_disabled', context_record.is_disabled,
    'default_branch', context_record.default_branch,
    'repository_updated_at', context_record.repository_updated_at,
    'installation_id', context_record.installation_id,
    'installation_status', context_record.installation_status
  );
end;
$$;

comment on function public.read_first_sync_context(uuid) is
  'Reads one explicit Project selected-repository and installation context without exposing credentials.';
alter function public.read_first_sync_context(uuid) owner to postgres;
revoke all on function public.read_first_sync_context(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.read_first_sync_context(uuid) to service_role;

create function public.get_first_sync_run(p_project_id uuid, p_run_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select to_jsonb(run_record)
  from public.sync_runs run_record
  where run_record.project_id = p_project_id
    and run_record.id = p_run_id
$$;

comment on function public.get_first_sync_run(uuid, uuid) is
  'Returns one SyncRun only when both explicit project and run identities match.';
alter function public.get_first_sync_run(uuid, uuid) owner to postgres;
revoke all on function public.get_first_sync_run(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_first_sync_run(uuid, uuid) to service_role;

create function public.checkpoint_first_sync_run(
  p_project_id uuid,
  p_run_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_checkpointed_at timestamptz,
  p_progress_cursor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_run public.sync_runs%rowtype;
begin
  if p_expected_status not in ('queued', 'running')
    or p_expected_version < 1
    or p_checkpointed_at is null
    or not app_private.first_sync_cursor_is_valid(
      p_progress_cursor, p_project_id, p_run_id
    )
  then
    raise exception using errcode = 'P0001', message = 'first_sync_cursor_invalid';
  end if;

  update public.sync_runs run_record
  set
    version = run_record.version + 1,
    last_progress_at = p_checkpointed_at,
    progress_cursor = p_progress_cursor
  where run_record.project_id = p_project_id
    and run_record.id = p_run_id
    and run_record.status = p_expected_status
    and run_record.version = p_expected_version
  returning * into saved_run;

  if found then return to_jsonb(saved_run); end if;
  if not exists (
    select 1 from public.sync_runs run_record
    where run_record.project_id = p_project_id and run_record.id = p_run_id
  ) then
    raise exception using errcode = 'P0002', message = 'sync_run_not_found';
  end if;
  raise exception using errcode = 'P0001', message = 'sync_run_concurrency_conflict';
exception
  when check_violation or not_null_violation then
    raise exception using errcode = 'P0001', message = 'first_sync_cursor_invalid';
end;
$$;

comment on function public.checkpoint_first_sync_run(
  uuid, uuid, text, bigint, timestamptz, text
) is
  'Atomically checkpoints a whitelisted first-sync cursor using project, status and version optimistic concurrency.';
alter function public.checkpoint_first_sync_run(
  uuid, uuid, text, bigint, timestamptz, text
) owner to postgres;
revoke all on function public.checkpoint_first_sync_run(
  uuid, uuid, text, bigint, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public.checkpoint_first_sync_run(
  uuid, uuid, text, bigint, timestamptz, text
) to service_role;

create function public.upsert_github_activity_snapshot_group(
  p_project_id uuid,
  p_group_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempted_count integer;
  accepted_count integer := 0;
begin
  if not exists (
    select 1 from public.projects project_record where project_record.id = p_project_id
  ) then
    raise exception using errcode = 'P0002', message = 'sync_run_project_not_found';
  end if;
  if p_group_name not in (
    'repository', 'commit', 'issue', 'pull_request', 'release', 'workflow_run'
  ) or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10000 then
    raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid';
  end if;
  attempted_count := jsonb_array_length(p_items);

  if p_group_name = 'repository' then
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','repositoryFullName',
          'defaultBranch','visibility','isPrivate','isFork','isArchived','isDisabled'
        ]::text[] <> '{}'::jsonb
        or not item ?& array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','repositoryFullName',
          'defaultBranch','visibility','isPrivate','isFork','isArchived','isDisabled'
        ]
    ) then raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid'; end if;
    insert into public.github_repository_snapshots (
      project_id, github_object_id, source_updated_at, source_version,
      repository_full_name, default_branch, visibility, is_private,
      is_fork, is_archived, is_disabled
    )
    select p_project_id, item->>'githubObjectId', (item->>'sourceUpdatedAt')::timestamptz,
      item->>'sourceVersion', item->>'repositoryFullName', item->>'defaultBranch',
      item->>'visibility', (item->>'isPrivate')::boolean, (item->>'isFork')::boolean,
      (item->>'isArchived')::boolean, (item->>'isDisabled')::boolean
    from jsonb_array_elements(p_items) item
    on conflict (project_id, github_object_id) do update set
      source_updated_at = excluded.source_updated_at, source_version = excluded.source_version,
      repository_full_name = excluded.repository_full_name, default_branch = excluded.default_branch,
      visibility = excluded.visibility, is_private = excluded.is_private,
      is_fork = excluded.is_fork, is_archived = excluded.is_archived,
      is_disabled = excluded.is_disabled
    where excluded.source_updated_at >= github_repository_snapshots.source_updated_at;
  elsif p_group_name = 'commit' then
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','message',
          'authoredAt','committedAt','authorLogin'
        ]::text[] <> '{}'::jsonb
        or not item ?& array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','message',
          'authoredAt','committedAt','authorLogin'
        ]
    ) then raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid'; end if;
    insert into public.github_commits (
      project_id, github_object_id, source_updated_at, source_version,
      message, authored_at, committed_at, author_login
    )
    select p_project_id, item->>'githubObjectId', (item->>'sourceUpdatedAt')::timestamptz,
      item->>'sourceVersion', item->>'message', (item->>'authoredAt')::timestamptz,
      (item->>'committedAt')::timestamptz, item->>'authorLogin'
    from jsonb_array_elements(p_items) item
    on conflict (project_id, github_object_id) do update set
      source_updated_at = excluded.source_updated_at, source_version = excluded.source_version,
      message = excluded.message, authored_at = excluded.authored_at,
      committed_at = excluded.committed_at, author_login = excluded.author_login
    where excluded.source_updated_at >= github_commits.source_updated_at;
  elsif p_group_name = 'issue' then
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','number','title',
          'state','authorLogin','closedAt'
        ]::text[] <> '{}'::jsonb
        or not item ?& array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','number','title',
          'state','authorLogin','closedAt'
        ]
    ) then raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid'; end if;
    insert into public.github_issues (
      project_id, github_object_id, source_updated_at, source_version,
      issue_number, title, state, author_login, closed_at
    )
    select p_project_id, item->>'githubObjectId', (item->>'sourceUpdatedAt')::timestamptz,
      item->>'sourceVersion', (item->>'number')::bigint, item->>'title',
      item->>'state', item->>'authorLogin', (item->>'closedAt')::timestamptz
    from jsonb_array_elements(p_items) item
    on conflict (project_id, github_object_id) do update set
      source_updated_at = excluded.source_updated_at, source_version = excluded.source_version,
      issue_number = excluded.issue_number, title = excluded.title, state = excluded.state,
      author_login = excluded.author_login, closed_at = excluded.closed_at
    where excluded.source_updated_at >= github_issues.source_updated_at;
  elsif p_group_name = 'pull_request' then
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','number','title','state',
          'isDraft','headSha','baseRef','mergedAt'
        ]::text[] <> '{}'::jsonb
        or not item ?& array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','number','title','state',
          'isDraft','headSha','baseRef','mergedAt'
        ]
    ) then raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid'; end if;
    insert into public.github_pull_requests (
      project_id, github_object_id, source_updated_at, source_version,
      pull_request_number, title, state, is_draft, head_sha, base_ref, merged_at
    )
    select p_project_id, item->>'githubObjectId', (item->>'sourceUpdatedAt')::timestamptz,
      item->>'sourceVersion', (item->>'number')::bigint, item->>'title', item->>'state',
      (item->>'isDraft')::boolean, item->>'headSha', item->>'baseRef',
      (item->>'mergedAt')::timestamptz
    from jsonb_array_elements(p_items) item
    on conflict (project_id, github_object_id) do update set
      source_updated_at = excluded.source_updated_at, source_version = excluded.source_version,
      pull_request_number = excluded.pull_request_number, title = excluded.title,
      state = excluded.state, is_draft = excluded.is_draft, head_sha = excluded.head_sha,
      base_ref = excluded.base_ref, merged_at = excluded.merged_at
    where excluded.source_updated_at >= github_pull_requests.source_updated_at;
  elsif p_group_name = 'release' then
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','tagName','name',
          'isDraft','isPrerelease','publishedAt'
        ]::text[] <> '{}'::jsonb
        or not item ?& array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','tagName','name',
          'isDraft','isPrerelease','publishedAt'
        ]
    ) then raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid'; end if;
    insert into public.github_releases (
      project_id, github_object_id, source_updated_at, source_version,
      tag_name, name, is_draft, is_prerelease, published_at
    )
    select p_project_id, item->>'githubObjectId', (item->>'sourceUpdatedAt')::timestamptz,
      item->>'sourceVersion', item->>'tagName', item->>'name',
      (item->>'isDraft')::boolean, (item->>'isPrerelease')::boolean,
      (item->>'publishedAt')::timestamptz
    from jsonb_array_elements(p_items) item
    on conflict (project_id, github_object_id) do update set
      source_updated_at = excluded.source_updated_at, source_version = excluded.source_version,
      tag_name = excluded.tag_name, name = excluded.name, is_draft = excluded.is_draft,
      is_prerelease = excluded.is_prerelease, published_at = excluded.published_at
    where excluded.source_updated_at >= github_releases.source_updated_at;
  elsif p_group_name = 'workflow_run' then
    if exists (
      select 1 from jsonb_array_elements(p_items) item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','workflowId','runNumber',
          'status','conclusion','eventName','headSha'
        ]::text[] <> '{}'::jsonb
        or not item ?& array[
          'githubObjectId','sourceUpdatedAt','sourceVersion','workflowId','runNumber',
          'status','conclusion','eventName','headSha'
        ]
    ) then raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid'; end if;
    insert into public.github_workflow_runs (
      project_id, github_object_id, source_updated_at, source_version,
      workflow_id, run_number, status, conclusion, event_name, head_sha
    )
    select p_project_id, item->>'githubObjectId', (item->>'sourceUpdatedAt')::timestamptz,
      item->>'sourceVersion', item->>'workflowId', (item->>'runNumber')::bigint,
      item->>'status', item->>'conclusion', item->>'eventName', item->>'headSha'
    from jsonb_array_elements(p_items) item
    on conflict (project_id, github_object_id) do update set
      source_updated_at = excluded.source_updated_at, source_version = excluded.source_version,
      workflow_id = excluded.workflow_id, run_number = excluded.run_number,
      status = excluded.status, conclusion = excluded.conclusion,
      event_name = excluded.event_name, head_sha = excluded.head_sha
    where excluded.source_updated_at >= github_workflow_runs.source_updated_at;
  end if;

  get diagnostics accepted_count = row_count;
  return jsonb_build_object(
    'group_name', p_group_name,
    'attempted', attempted_count,
    'accepted', accepted_count,
    'rejected', 0
  );
exception
  when check_violation or not_null_violation or invalid_text_representation
    or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'github_activity_snapshot_write_invalid';
end;
$$;

comment on function public.upsert_github_activity_snapshot_group(uuid, text, jsonb) is
  'Upserts one explicit typed snapshot group through exact field whitelists and project-scoped unique keys.';
alter function public.upsert_github_activity_snapshot_group(uuid, text, jsonb)
owner to postgres;
revoke all on function public.upsert_github_activity_snapshot_group(uuid, text, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.upsert_github_activity_snapshot_group(uuid, text, jsonb)
to service_role;
