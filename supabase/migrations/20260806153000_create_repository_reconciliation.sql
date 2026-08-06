-- logical_migration_id: 0014
-- contract_versions: repository-reconciliation.v1, reconciliation-schedule.v1,
--                    manual-resync.v1, sync-request-coalescing.v1
-- purpose: provide minimal local fact digests and project-scoped durable
--          sync request dispatch convergence for reconciliation and manual resync

create table public.project_sync_dispatches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  request_identity text not null,
  trigger_source text not null,
  dispatch_status text not null default 'pending',
  version bigint not null default 1,
  lease_expires_at timestamptz,
  provider_job_id text,
  requested_at timestamptz not null,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_sync_dispatches_run_unique unique (sync_run_id),
  constraint project_sync_dispatches_identity_unique unique (project_id, request_identity),
  constraint project_sync_dispatches_identity_check check (
    request_identity = btrim(request_identity)
    and request_identity ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,99}$'
  ),
  constraint project_sync_dispatches_trigger_check check (
    trigger_source in ('first_sync', 'webhook', 'reconciliation', 'manual')
  ),
  constraint project_sync_dispatches_status_check check (
    dispatch_status in ('pending', 'dispatching', 'dispatched')
  ),
  constraint project_sync_dispatches_version_check check (version >= 1),
  constraint project_sync_dispatches_provider_check check (
    provider_job_id is null
    or (
      provider_job_id = btrim(provider_job_id)
      and provider_job_id ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'
    )
  ),
  constraint project_sync_dispatches_state_check check (
    (dispatch_status = 'pending' and lease_expires_at is null and provider_job_id is null and dispatched_at is null)
    or (dispatch_status = 'dispatching' and lease_expires_at is not null and provider_job_id is null and dispatched_at is null)
    or (dispatch_status = 'dispatched' and lease_expires_at is null and provider_job_id is not null and dispatched_at is not null)
  )
);

comment on table public.project_sync_dispatches is
  'Durable service-only dispatch facts for project sync requests. Raw provider payloads, credentials, source and diffs are excluded.';
comment on column public.project_sync_dispatches.request_identity is
  'Stable caller identity scoped by project_id; provider receipt identifiers are not business identity.';

create index project_sync_dispatches_recovery_idx
on public.project_sync_dispatches (dispatch_status, lease_expires_at, requested_at, id)
where dispatch_status in ('pending', 'dispatching');

create trigger project_sync_dispatches_set_updated_at
before update on public.project_sync_dispatches
for each row execute function app_private.set_updated_at();

alter table public.project_sync_dispatches enable row level security;
revoke all on table public.project_sync_dispatches
from public, anon, authenticated, service_role;

create function public.list_reconciliation_projects(p_snapshot_since timestamptz)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(project_document order by project_document->>'project_id'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'project_id', project_record.id,
      'selected_repository_id', selection_record.id,
      'installation_id', installation_record.installation_id,
      'installation_status', installation_record.status,
      'repository_id', selection_record.github_repository_id,
      'repository_owner', selection_record.owner_login,
      'repository_name', selection_record.name,
      'repository_full_name', selection_record.full_name,
      'mapping_complete', true,
      'local_facts', jsonb_build_object(
        'repository', coalesce((
          select pg_catalog.encode(extensions.digest(
            pg_catalog.concat_ws(
              pg_catalog.chr(31),
              snapshot.github_object_id,
              snapshot.repository_full_name,
              snapshot.default_branch,
              snapshot.visibility,
              snapshot.is_private::text,
              snapshot.is_fork::text,
              snapshot.is_archived::text,
              snapshot.is_disabled::text
            ), 'sha256'
          ), 'hex')
          from public.github_repository_snapshots snapshot
          where snapshot.project_id = project_record.id
            and snapshot.source_updated_at >= p_snapshot_since
          order by snapshot.source_updated_at desc, snapshot.id desc
          limit 1
        ), pg_catalog.encode(extensions.digest('', 'sha256'), 'hex')),
        'commit', pg_catalog.encode(extensions.digest(coalesce((
          select pg_catalog.string_agg(item.github_object_id || pg_catalog.chr(31) || item.source_version, pg_catalog.chr(30) order by item.github_object_id)
          from public.github_commits item
          where item.project_id = project_record.id and item.source_updated_at >= p_snapshot_since
        ), ''), 'sha256'), 'hex'),
        'issue', pg_catalog.encode(extensions.digest(coalesce((
          select pg_catalog.string_agg(item.github_object_id || pg_catalog.chr(31) || item.source_version, pg_catalog.chr(30) order by item.github_object_id)
          from public.github_issues item
          where item.project_id = project_record.id and item.source_updated_at >= p_snapshot_since
        ), ''), 'sha256'), 'hex'),
        'pull_request', pg_catalog.encode(extensions.digest(coalesce((
          select pg_catalog.string_agg(item.github_object_id || pg_catalog.chr(31) || item.source_version, pg_catalog.chr(30) order by item.github_object_id)
          from public.github_pull_requests item
          where item.project_id = project_record.id and item.source_updated_at >= p_snapshot_since
        ), ''), 'sha256'), 'hex'),
        'release', pg_catalog.encode(extensions.digest(coalesce((
          select pg_catalog.string_agg(item.github_object_id || pg_catalog.chr(31) || item.source_version, pg_catalog.chr(30) order by item.github_object_id)
          from public.github_releases item
          where item.project_id = project_record.id and item.source_updated_at >= p_snapshot_since
        ), ''), 'sha256'), 'hex'),
        'workflow_run', pg_catalog.encode(extensions.digest(coalesce((
          select pg_catalog.string_agg(item.github_object_id || pg_catalog.chr(31) || item.source_version, pg_catalog.chr(30) order by item.github_object_id)
          from public.github_workflow_runs item
          where item.project_id = project_record.id and item.source_updated_at >= p_snapshot_since
        ), ''), 'sha256'), 'hex')
      )
    ) as project_document
    from public.projects project_record
    join public.selected_repositories selection_record
      on selection_record.id = project_record.selected_repository_id
      and selection_record.user_id = project_record.user_id
    join public.github_installations installation_record
      on installation_record.id = selection_record.github_installation_id
      and installation_record.user_id = project_record.user_id
    where project_record.status in ('in_planning', 'in_development', 'polishing')
  ) eligible;
$$;

comment on function public.list_reconciliation_projects(timestamptz) is
  'Returns trusted eligible project context and six fixed SHA-256 digests from structured snapshots only.';
alter function public.list_reconciliation_projects(timestamptz) owner to postgres;
revoke all on function public.list_reconciliation_projects(timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.list_reconciliation_projects(timestamptz) to service_role;

create function public.request_project_sync(
  p_project_id uuid,
  p_trigger_source text,
  p_request_identity text,
  p_actor_user_id uuid,
  p_requested_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  context_record record;
  run_record public.sync_runs%rowtype;
  dispatch_record public.project_sync_dispatches%rowtype;
  idempotency_value text;
begin
  if p_trigger_source not in ('first_sync', 'webhook', 'reconciliation', 'manual')
    or p_request_identity is null
    or p_request_identity <> btrim(p_request_identity)
    or p_request_identity !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,99}$'
    or p_requested_at is null
    or (p_trigger_source = 'manual' and p_actor_user_id is null)
    or (p_trigger_source <> 'manual' and p_actor_user_id is not null)
  then
    raise exception using errcode='P0001', message='sync_request_invalid';
  end if;

  select project_record.user_id, installation_record.status as installation_status
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
    return jsonb_build_object(
      'outcome','not_found','project_id',p_project_id,'sync_run_id',null,
      'sync_run_status',null,'dispatch_status',null,'dispatch_version',null
    );
  end if;
  if p_trigger_source = 'manual' and context_record.user_id <> p_actor_user_id then
    return jsonb_build_object(
      'outcome','forbidden','project_id',p_project_id,'sync_run_id',null,
      'sync_run_status',null,'dispatch_status',null,'dispatch_version',null
    );
  end if;
  if context_record.installation_status = 'revoked' then
    return jsonb_build_object(
      'outcome','authorization_revoked','project_id',p_project_id,'sync_run_id',null,
      'sync_run_status',null,'dispatch_status',null,'dispatch_version',null
    );
  end if;
  if context_record.installation_status = 'suspended' then
    return jsonb_build_object(
      'outcome','suspended','project_id',p_project_id,'sync_run_id',null,
      'sync_run_status',null,'dispatch_status',null,'dispatch_version',null
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_project_id::text, 7)
  );
  idempotency_value := 'sync-request:' || p_request_identity;

  select candidate.* into run_record
  from public.sync_runs candidate
  where candidate.project_id = p_project_id
    and candidate.idempotency_key = idempotency_value;
  if found then
    select candidate.* into dispatch_record
    from public.project_sync_dispatches candidate
    where candidate.sync_run_id = run_record.id;
    return jsonb_build_object(
      'outcome','duplicate','project_id',p_project_id,
      'sync_run_id',run_record.id,'sync_run_status',run_record.status,
      'dispatch_status',case when dispatch_record.id is null then null else dispatch_record.dispatch_status end,
      'dispatch_version',case when dispatch_record.id is null then null else dispatch_record.version end
    );
  end if;

  select candidate.* into run_record
  from public.sync_runs candidate
  where candidate.project_id = p_project_id
    and candidate.status in ('queued','running')
  order by candidate.created_at, candidate.id
  limit 1;
  if found then
    select candidate.* into dispatch_record
    from public.project_sync_dispatches candidate
    where candidate.sync_run_id = run_record.id;
    return jsonb_build_object(
      'outcome','coalesced','project_id',p_project_id,
      'sync_run_id',run_record.id,'sync_run_status',run_record.status,
      'dispatch_status',case when dispatch_record.id is null then null else dispatch_record.dispatch_status end,
      'dispatch_version',case when dispatch_record.id is null then null else dispatch_record.version end
    );
  end if;

  insert into public.sync_runs(
    project_id,idempotency_key,trigger_source,queued_at,created_at,updated_at
  ) values (
    p_project_id,idempotency_value,p_trigger_source,p_requested_at,p_requested_at,p_requested_at
  ) returning * into run_record;

  insert into public.project_sync_dispatches(
    project_id,sync_run_id,request_identity,trigger_source,requested_at,
    created_at,updated_at
  ) values (
    p_project_id,run_record.id,p_request_identity,p_trigger_source,p_requested_at,
    p_requested_at,p_requested_at
  ) returning * into dispatch_record;

  return jsonb_build_object(
    'outcome','new','project_id',p_project_id,
    'sync_run_id',run_record.id,'sync_run_status',run_record.status,
    'dispatch_status',dispatch_record.dispatch_status,
    'dispatch_version',dispatch_record.version
  );
exception when check_violation or not_null_violation or unique_violation then
  raise exception using errcode='P0001', message='sync_request_invalid';
end;
$$;

comment on function public.request_project_sync(uuid,text,text,uuid,timestamptz) is
  'Atomically validates trusted ownership and installation state, then creates, reuses or coalesces a project sync request.';
alter function public.request_project_sync(uuid,text,text,uuid,timestamptz) owner to postgres;
revoke all on function public.request_project_sync(uuid,text,text,uuid,timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.request_project_sync(uuid,text,text,uuid,timestamptz)
to service_role;

create function public.claim_project_sync_dispatch(
  p_project_id uuid,
  p_sync_run_id uuid,
  p_expected_version bigint,
  p_claimed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.project_sync_dispatches%rowtype;
begin
  if p_expected_version < 1 or p_claimed_at is null then
    raise exception using errcode='P0001', message='sync_dispatch_invalid';
  end if;
  update public.project_sync_dispatches dispatch
  set dispatch_status='dispatching',
      version=dispatch.version+1,
      lease_expires_at=p_claimed_at+interval '60 seconds'
  where dispatch.project_id=p_project_id
    and dispatch.sync_run_id=p_sync_run_id
    and dispatch.version=p_expected_version
    and (
      dispatch.dispatch_status='pending'
      or (dispatch.dispatch_status='dispatching' and dispatch.lease_expires_at<=p_claimed_at)
    )
  returning * into saved;
  if found then
    return jsonb_build_object('claimed',true,'version',saved.version);
  end if;
  select * into saved from public.project_sync_dispatches dispatch
  where dispatch.project_id=p_project_id and dispatch.sync_run_id=p_sync_run_id;
  if not found then raise exception using errcode='P0002',message='sync_dispatch_not_found'; end if;
  return jsonb_build_object('claimed',false,'version',saved.version);
end;
$$;

alter function public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz) owner to postgres;
revoke all on function public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)
to service_role;

create function public.complete_project_sync_dispatch(
  p_project_id uuid,
  p_sync_run_id uuid,
  p_expected_version bigint,
  p_provider_job_id text,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare saved public.project_sync_dispatches%rowtype;
begin
  if p_expected_version < 1 or p_completed_at is null
    or p_provider_job_id is null
    or p_provider_job_id <> btrim(p_provider_job_id)
    or p_provider_job_id !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'
  then raise exception using errcode='P0001',message='sync_dispatch_invalid'; end if;
  update public.project_sync_dispatches dispatch
  set dispatch_status='dispatched',
      version=dispatch.version+1,
      lease_expires_at=null,
      provider_job_id=p_provider_job_id,
      dispatched_at=p_completed_at
  where dispatch.project_id=p_project_id
    and dispatch.sync_run_id=p_sync_run_id
    and dispatch.version=p_expected_version
    and dispatch.dispatch_status='dispatching'
  returning * into saved;
  if not found then
    if not exists(select 1 from public.project_sync_dispatches dispatch where dispatch.project_id=p_project_id and dispatch.sync_run_id=p_sync_run_id)
      then raise exception using errcode='P0002',message='sync_dispatch_not_found';
    end if;
    raise exception using errcode='P0001',message='sync_dispatch_concurrency_conflict';
  end if;
  return jsonb_build_object('completed',true,'version',saved.version);
end;
$$;

alter function public.complete_project_sync_dispatch(uuid,uuid,bigint,text,timestamptz) owner to postgres;
revoke all on function public.complete_project_sync_dispatch(uuid,uuid,bigint,text,timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.complete_project_sync_dispatch(uuid,uuid,bigint,text,timestamptz)
to service_role;
