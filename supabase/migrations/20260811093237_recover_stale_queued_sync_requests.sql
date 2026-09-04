-- logical_migration_id: 0016
-- contract_versions: sync-request-coalescing.v1, synchronization-state.v1
-- purpose: atomically retire never-started stale queued runs before creating a replacement request

create or replace function public.request_project_sync(
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

  update public.sync_runs candidate
  set status = 'failed',
      version = candidate.version + 1,
      finished_at = p_requested_at,
      error_code = 'sync_run_stale_queued',
      error_summary = 'Stale queued sync request recovered.'
  where candidate.project_id = p_project_id
    and candidate.status = 'queued'
    and candidate.started_at is null
    and candidate.last_progress_at is null
    and candidate.finished_at is null
    and candidate.progress_cursor is null
    and candidate.queued_at <= p_requested_at - interval '15 minutes'
    and candidate.created_at <= p_requested_at - interval '15 minutes'
    and candidate.updated_at <= p_requested_at - interval '15 minutes';

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
  'Atomically validates trusted ownership and installation state, then creates, reuses or coalesces a project sync request after retiring never-started queued runs inactive for at least fifteen minutes.';
alter function public.request_project_sync(uuid,text,text,uuid,timestamptz) owner to postgres;
revoke all on function public.request_project_sync(uuid,text,text,uuid,timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.request_project_sync(uuid,text,text,uuid,timestamptz)
to service_role;
