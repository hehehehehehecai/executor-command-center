-- logical_migration_id: 0015
-- contract_versions: github-webhook-delivery-processing.v1
-- purpose: bind ordinary dispatched webhook deliveries to trusted webhook
--          SyncRuns and persist optimistic processing completion or safe retry

alter table public.github_webhook_deliveries
  add column sync_run_id uuid,
  add column processing_lease_until timestamptz,
  add constraint github_webhook_deliveries_sync_run_fkey
    foreign key (sync_run_id) references public.sync_runs(id) on delete set null;

comment on column public.github_webhook_deliveries.sync_run_id is
  'Trusted webhook-triggered SyncRun bound during service-only processing claim.';
comment on column public.github_webhook_deliveries.processing_lease_until is
  'Short optimistic processing lease. It contains no provider payload or credentials.';

alter table public.github_webhook_deliveries
  drop constraint github_webhook_deliveries_status_check,
  drop constraint github_webhook_deliveries_check,
  add constraint github_webhook_deliveries_status_check check (
    status in ('pending','dispatching','dispatched','processing','failed','ignored','completed')
  ),
  add constraint github_webhook_deliveries_state_check check (
    (
      status in ('pending','ignored')
      and dispatch_lease_until is null
      and processing_lease_until is null
      and provider_receipt_id is null
      and sync_run_id is null
      and safe_error_code is null
    )
    or (
      status='dispatching'
      and dispatch_lease_until is not null
      and processing_lease_until is null
      and provider_receipt_id is null
      and sync_run_id is null
      and safe_error_code is null
    )
    or (
      status='dispatched'
      and dispatch_lease_until is null
      and processing_lease_until is null
      and provider_receipt_id is not null
      and sync_run_id is null
      and safe_error_code is null
    )
    or (
      status='processing'
      and dispatch_lease_until is null
      and processing_lease_until is not null
      and provider_receipt_id is not null
      and sync_run_id is not null
      and safe_error_code is null
      and event_name <> 'installation'
    )
    or (
      status='failed'
      and dispatch_lease_until is null
      and processing_lease_until is null
      and provider_receipt_id is not null
      and sync_run_id is not null
      and safe_error_code is not null
      and event_name <> 'installation'
    )
    or (
      status='completed'
      and dispatch_lease_until is null
      and processing_lease_until is null
      and safe_error_code is null
      and (
        (
          event_name='installation'
          and provider_receipt_id is null
          and sync_run_id is null
        )
        or (
          event_name <> 'installation'
          and provider_receipt_id is not null
          and sync_run_id is not null
        )
      )
    )
  );

create index github_webhook_deliveries_processing_recovery_idx
on public.github_webhook_deliveries (
  status,
  processing_lease_until,
  updated_at,
  id
)
where status in ('dispatched','processing','failed');

create function public.claim_github_webhook_processing(
  p_delivery_id uuid,
  p_sync_run_id uuid,
  p_expected_version bigint,
  p_claimed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.github_webhook_deliveries%rowtype;
  run_record public.sync_runs%rowtype;
begin
  if p_delivery_id is null
    or p_sync_run_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_claimed_at is null
  then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_request';
  end if;

  select candidate.* into delivery_record
  from public.github_webhook_deliveries candidate
  where candidate.delivery_id=p_delivery_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_delivery_not_found';
  end if;

  if delivery_record.event_name='installation'
    or delivery_record.status not in ('dispatched','processing','failed')
    or delivery_record.version <> p_expected_version
    or (
      delivery_record.status='processing'
      and delivery_record.processing_lease_until > p_claimed_at
    )
  then
    return jsonb_build_object(
      'claimed',false,
      'status',delivery_record.status,
      'version',delivery_record.version
    );
  end if;

  if delivery_record.sync_run_id is not null
    and delivery_record.sync_run_id <> p_sync_run_id
  then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_sync_run';
  end if;

  select candidate.* into run_record
  from public.sync_runs candidate
  where candidate.id=p_sync_run_id
    and candidate.project_id=delivery_record.project_id
    and candidate.trigger_source='webhook';

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_sync_run';
  end if;

  update public.github_webhook_deliveries
  set status='processing',
      sync_run_id=p_sync_run_id,
      processing_lease_until=p_claimed_at + interval '5 minutes',
      safe_error_code=null,
      version=version+1,
      updated_at=p_claimed_at
  where delivery_id=p_delivery_id
    and version=p_expected_version
  returning * into delivery_record;

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_concurrency_conflict';
  end if;

  return jsonb_build_object(
    'claimed',true,
    'status',delivery_record.status,
    'version',delivery_record.version
  );
end;
$$;

comment on function public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz) is
  'Binds and leases an ordinary dispatched delivery to a same-Project webhook SyncRun without exposing the delivery table.';

create function public.complete_github_webhook_processing(
  p_delivery_id uuid,
  p_sync_run_id uuid,
  p_expected_version bigint,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.github_webhook_deliveries%rowtype;
  run_record public.sync_runs%rowtype;
begin
  if p_delivery_id is null
    or p_sync_run_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_completed_at is null
  then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_request';
  end if;

  select candidate.* into delivery_record
  from public.github_webhook_deliveries candidate
  where candidate.delivery_id=p_delivery_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_delivery_not_found';
  end if;

  if delivery_record.event_name='installation'
    or delivery_record.sync_run_id is distinct from p_sync_run_id
  then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_sync_run';
  end if;

  if delivery_record.status='completed' then
    return jsonb_build_object(
      'outcome','duplicate',
      'status',delivery_record.status,
      'version',delivery_record.version
    );
  end if;

  if delivery_record.status <> 'processing'
    or delivery_record.version <> p_expected_version
  then
    raise exception using errcode='P0001', message='github_webhook_processing_concurrency_conflict';
  end if;

  select candidate.* into run_record
  from public.sync_runs candidate
  where candidate.id=p_sync_run_id
    and candidate.project_id=delivery_record.project_id
    and candidate.trigger_source='webhook';

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_sync_run';
  end if;
  if run_record.status not in ('completed','partial') then
    raise exception using errcode='P0001', message='github_webhook_processing_sync_run_not_terminal';
  end if;

  update public.github_webhook_deliveries
  set status='completed',
      processing_lease_until=null,
      safe_error_code=null,
      version=version+1,
      updated_at=p_completed_at
  where delivery_id=p_delivery_id
    and version=p_expected_version
    and status='processing'
  returning * into delivery_record;

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_concurrency_conflict';
  end if;

  return jsonb_build_object(
    'outcome','completed',
    'status',delivery_record.status,
    'version',delivery_record.version
  );
end;
$$;

comment on function public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz) is
  'Completes ordinary delivery processing only after the bound webhook SyncRun reaches completed or partial; provider receipt is retained.';

create function public.fail_github_webhook_processing(
  p_delivery_id uuid,
  p_sync_run_id uuid,
  p_expected_version bigint,
  p_safe_error_code text,
  p_failed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_record public.github_webhook_deliveries%rowtype;
  run_record public.sync_runs%rowtype;
begin
  if p_safe_error_code is null or p_safe_error_code not in (
    'github_activity_rate_limited',
    'github_activity_timeout',
    'github_activity_unavailable',
    'github_activity_snapshot_write_failed',
    'sync_run_concurrency_conflict',
    'github_webhook_processing_failed'
  ) then
    raise exception using errcode='P0001', message='github_webhook_processing_error_code_invalid';
  end if;
  if p_delivery_id is null
    or p_sync_run_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_failed_at is null
  then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_request';
  end if;

  select candidate.* into delivery_record
  from public.github_webhook_deliveries candidate
  where candidate.delivery_id=p_delivery_id
  for update;

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_delivery_not_found';
  end if;
  if delivery_record.event_name='installation'
    or delivery_record.sync_run_id is distinct from p_sync_run_id
  then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_sync_run';
  end if;
  if delivery_record.status <> 'processing'
    or delivery_record.version <> p_expected_version
  then
    raise exception using errcode='P0001', message='github_webhook_processing_concurrency_conflict';
  end if;

  select candidate.* into run_record
  from public.sync_runs candidate
  where candidate.id=p_sync_run_id
    and candidate.project_id=delivery_record.project_id
    and candidate.trigger_source='webhook';
  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_invalid_sync_run';
  end if;

  update public.github_webhook_deliveries
  set status='failed',
      processing_lease_until=null,
      safe_error_code=p_safe_error_code,
      version=version+1,
      updated_at=p_failed_at
  where delivery_id=p_delivery_id
    and version=p_expected_version
    and status='processing'
  returning * into delivery_record;

  if not found then
    raise exception using errcode='P0001', message='github_webhook_processing_concurrency_conflict';
  end if;

  return jsonb_build_object(
    'outcome','failed',
    'status',delivery_record.status,
    'version',delivery_record.version
  );
end;
$$;

comment on function public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz) is
  'Persists only an allowlisted processing failure code and permits the same delivery and SyncRun identity to be reclaimed.';

alter function public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz) owner to postgres;
alter function public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz) owner to postgres;
alter function public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz) owner to postgres;

revoke all on function
  public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz),
  public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz),
  public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz)
from public, anon, authenticated, service_role;

grant execute on function
  public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz),
  public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz),
  public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz)
to service_role;

revoke all on table public.github_webhook_deliveries
from public, anon, authenticated, service_role;
