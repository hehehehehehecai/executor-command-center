-- logical_migration_id: 0011
-- contract_versions: sync-runs.v1, synchronization-state.v1, freshness-status.v1
-- purpose: persist project-owned synchronization runs with atomic state transitions

create table public.sync_runs (
  id uuid constraint sync_runs_pkey primary key default gen_random_uuid(),
  project_id uuid not null
    constraint sync_runs_project_id_fkey
    references public.projects(id) on delete cascade,
  idempotency_key text not null,
  trigger_source text not null,
  status text not null default 'queued',
  version bigint not null default 1,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_progress_at timestamptz,
  progress_cursor text,
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_runs_project_idempotency_key
    unique (project_id, idempotency_key),
  constraint sync_runs_idempotency_key_check check (
    idempotency_key = btrim(idempotency_key)
    and idempotency_key <> ''
    and char_length(idempotency_key) <= 255
  ),
  constraint sync_runs_trigger_source_check check (
    trigger_source = btrim(trigger_source)
    and trigger_source <> ''
    and char_length(trigger_source) <= 100
  ),
  constraint sync_runs_status_check check (
    status in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')
  ),
  constraint sync_runs_version_check check (version >= 1),
  constraint sync_runs_progress_cursor_check check (
    progress_cursor is null
    or (
      progress_cursor = btrim(progress_cursor)
      and progress_cursor <> ''
      and char_length(progress_cursor) <= 2000
    )
  ),
  constraint sync_runs_error_code_check check (
    error_code is null
    or (
      error_code = btrim(error_code)
      and error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
      and char_length(error_code) <= 128
    )
  ),
  constraint sync_runs_error_summary_check check (
    error_summary is null
    or (
      error_summary = btrim(error_summary)
      and error_summary <> ''
      and char_length(error_summary) <= 500
    )
  ),
  constraint sync_runs_timestamp_order_check check (
    (started_at is null or started_at >= queued_at)
    and (finished_at is null or finished_at >= queued_at)
    and (last_progress_at is null or last_progress_at >= queued_at)
  ),
  constraint sync_runs_status_timestamps_check check (
    (
      status = 'queued'
      and started_at is null
      and finished_at is null
      and error_code is null
      and error_summary is null
    )
    or (
      status in ('running', 'partial')
      and started_at is not null
      and finished_at is null
      and error_code is null
      and error_summary is null
    )
    or (
      status = 'completed'
      and started_at is not null
      and finished_at is not null
      and error_code is null
      and error_summary is null
    )
    or (
      status = 'failed'
      and finished_at is not null
      and error_code is not null
    )
    or (
      status = 'cancelled'
      and finished_at is not null
      and error_code is null
      and error_summary is null
    )
  )
);

comment on table public.sync_runs is
  'Project-owned synchronization run facts. Freshness is derived and is not stored. Tokens, authorization headers and raw GitHub payloads are excluded.';
comment on column public.sync_runs.idempotency_key is
  'Caller-controlled idempotency key scoped by project_id.';
comment on column public.sync_runs.trigger_source is
  'Bounded source label only; trigger-specific scheduling belongs to later tasks.';
comment on column public.sync_runs.progress_cursor is
  'Optional bounded opaque progress marker; it must not contain credentials or raw GitHub payloads.';

create index sync_runs_project_created_idx
on public.sync_runs (project_id, created_at desc, id desc);

create index sync_runs_project_active_updated_idx
on public.sync_runs (project_id, updated_at desc, id desc)
where status in ('queued', 'running', 'partial');

create trigger sync_runs_set_updated_at
before update on public.sync_runs
for each row execute function app_private.set_updated_at();

alter table public.sync_runs enable row level security;
revoke all on table public.sync_runs
from public, anon, authenticated, service_role;

create policy sync_runs_select_own
on public.sync_runs
for select to authenticated
using (
  exists (
    select 1
    from public.projects project_record
    where project_record.id = sync_runs.project_id
      and project_record.user_id = (select auth.uid())
  )
);

grant select on table public.sync_runs to authenticated;

create function public.create_sync_run(
  p_project_id uuid,
  p_idempotency_key text,
  p_trigger_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_run public.sync_runs%rowtype;
begin
  if not exists (
    select 1 from public.projects project_record
    where project_record.id = p_project_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'sync_run_project_not_found';
  end if;

  insert into public.sync_runs (
    project_id,
    idempotency_key,
    trigger_source
  ) values (
    p_project_id,
    p_idempotency_key,
    p_trigger_source
  )
  on conflict (project_id, idempotency_key) do nothing
  returning * into saved_run;

  if not found then
    select sync_run_record.*
    into saved_run
    from public.sync_runs sync_run_record
    where sync_run_record.project_id = p_project_id
      and sync_run_record.idempotency_key = p_idempotency_key;
  end if;

  return to_jsonb(saved_run);
exception
  when check_violation or not_null_violation then
    raise exception using
      errcode = 'P0001',
      message = 'sync_run_invalid_request';
end;
$$;

comment on function public.create_sync_run(uuid, text, text) is
  'Creates one queued SyncRun per project-scoped idempotency key, or returns the existing run without modifying it.';

alter function public.create_sync_run(uuid, text, text) owner to postgres;
revoke all on function public.create_sync_run(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_sync_run(uuid, text, text)
to service_role;

create function public.get_latest_sync_run(p_project_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  latest_run public.sync_runs%rowtype;
begin
  if not exists (
    select 1 from public.projects project_record
    where project_record.id = p_project_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'sync_run_project_not_found';
  end if;

  select sync_run_record.*
  into latest_run
  from public.sync_runs sync_run_record
  where sync_run_record.project_id = p_project_id
  order by sync_run_record.created_at desc, sync_run_record.id desc
  limit 1;

  if not found then return null; end if;
  return to_jsonb(latest_run);
end;
$$;

comment on function public.get_latest_sync_run(uuid) is
  'Returns only the latest SyncRun for one explicit project through the service-role boundary.';

alter function public.get_latest_sync_run(uuid) owner to postgres;
revoke all on function public.get_latest_sync_run(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_latest_sync_run(uuid)
to service_role;

create function public.transition_sync_run(
  p_project_id uuid,
  p_run_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_target_status text,
  p_transitioned_at timestamptz,
  p_progress_cursor text,
  p_error_code text,
  p_error_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_run public.sync_runs%rowtype;
  allowed_transition boolean;
begin
  if p_expected_status not in (
    'queued', 'running', 'partial', 'completed', 'failed', 'cancelled'
  ) or p_target_status not in (
    'queued', 'running', 'partial', 'completed', 'failed', 'cancelled'
  ) or p_expected_version < 1 or p_transitioned_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'sync_run_invalid_request';
  end if;

  if p_target_status = 'failed' then
    if p_error_code is null then
      raise exception using
        errcode = 'P0001',
        message = 'sync_run_invalid_request';
    end if;
  elsif p_error_code is not null or p_error_summary is not null then
    raise exception using
      errcode = 'P0001',
      message = 'sync_run_invalid_request';
  end if;

  if p_expected_status = p_target_status then
    select candidate.*
    into result_run
    from public.sync_runs candidate
    where candidate.id = p_run_id
      and candidate.project_id = p_project_id
      and candidate.status = p_expected_status
      and candidate.version = p_expected_version;

    if found then return to_jsonb(result_run); end if;
  else
    allowed_transition :=
      (p_expected_status = 'queued' and p_target_status in ('running', 'cancelled', 'failed'))
      or (p_expected_status = 'running' and p_target_status in ('partial', 'completed', 'failed', 'cancelled'))
      or (p_expected_status = 'partial' and p_target_status in ('running', 'completed', 'failed', 'cancelled'));

    if not allowed_transition then
      raise exception using
        errcode = 'P0001',
        message = 'sync_run_invalid_transition';
    end if;

    update public.sync_runs sync_run_record
    set
      status = p_target_status,
      version = sync_run_record.version + 1,
      started_at = case
        when p_target_status = 'running'
          then coalesce(sync_run_record.started_at, p_transitioned_at)
        else sync_run_record.started_at
      end,
      finished_at = case
        when p_target_status in ('completed', 'failed', 'cancelled')
          then p_transitioned_at
        else null
      end,
      last_progress_at = case
        when p_target_status = 'partial' or p_progress_cursor is not null
          then p_transitioned_at
        else sync_run_record.last_progress_at
      end,
      progress_cursor = coalesce(p_progress_cursor, sync_run_record.progress_cursor),
      error_code = case when p_target_status = 'failed' then p_error_code else null end,
      error_summary = case when p_target_status = 'failed' then p_error_summary else null end
    where sync_run_record.id = p_run_id
      and sync_run_record.project_id = p_project_id
      and sync_run_record.status = p_expected_status
      and sync_run_record.version = p_expected_version
    returning * into result_run;

    if found then return to_jsonb(result_run); end if;
  end if;

  if not exists (
    select 1 from public.sync_runs candidate
    where candidate.id = p_run_id
      and candidate.project_id = p_project_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'sync_run_not_found';
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'sync_run_concurrency_conflict';
exception
  when check_violation or not_null_violation then
    raise exception using
      errcode = 'P0001',
      message = 'sync_run_invalid_request';
end;
$$;

comment on function public.transition_sync_run(
  uuid, uuid, text, bigint, text, timestamptz, text, text, text
) is
  'Atomically advances a SyncRun only when project, current status and version match. Same-state replay is an unchanged no-op.';

alter function public.transition_sync_run(
  uuid, uuid, text, bigint, text, timestamptz, text, text, text
) owner to postgres;
revoke all on function public.transition_sync_run(
  uuid, uuid, text, bigint, text, timestamptz, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.transition_sync_run(
  uuid, uuid, text, bigint, text, timestamptz, text, text, text
) to service_role;
