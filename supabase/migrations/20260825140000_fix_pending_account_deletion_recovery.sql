-- logical_migration_id: 0030
-- contract_versions: account-deletion.v1, account-deletion-storage.v1
-- purpose: Phase 3.2 claim-preceding retry exhaustion recovery

drop index if exists public.account_deletion_recovery_eligible_idx;
create index account_deletion_recovery_eligible_idx
on public.account_deletion_operations(recovery_eligible_at,due_at,user_id)
where recovery_eligible_at is not null
  and retry_exhausted_at is not null
  and recovery_generation>0
  and status in('deletion_pending','deleting','deletion_failed');

-- Existing active rows may have been cancelled by the Phase 3.1 function,
-- which did not know how to clear the later recovery columns.
update public.account_deletion_operations operation set
  recovery_generation=0,
  recovery_eligible_at=null,
  recovery_dispatch_token=null,
  recovery_dispatch_lease_expires_at=null,
  recovery_dispatched_at=null,
  recovery_dispatch_attempts=0,
  recovery_last_error_code=null,
  retry_exhausted_at=null,
  retry_exhausted_count=0
where operation.status='active'
  and (
    operation.recovery_generation<>0
    or operation.recovery_eligible_at is not null
    or operation.recovery_dispatch_token is not null
    or operation.recovery_dispatch_lease_expires_at is not null
    or operation.recovery_dispatched_at is not null
    or operation.recovery_dispatch_attempts<>0
    or operation.recovery_last_error_code is not null
    or operation.retry_exhausted_at is not null
    or operation.retry_exhausted_count<>0
  );

create or replace function public.request_account_deletion(
  p_actor_user_id uuid,p_idempotency_key text,p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
  authoritative_now timestamptz:=clock_timestamp();
begin
  if p_actor_user_id is null
    or p_idempotency_key is null
    or p_idempotency_key<>btrim(p_idempotency_key)
    or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$'
    or p_confirmation is distinct from 'DELETE ACCOUNT '||p_actor_user_id::text
  then raise exception using errcode='P0001',message='account_deletion_invalid_request'; end if;

  perform 1 from public.github_installations installation
  where installation.user_id=p_actor_user_id order by installation.id for update;
  select candidate.* into operation
  from public.account_deletion_operations candidate
  where candidate.user_id=p_actor_user_id for update;
  if not found or not exists(select 1 from public.users where id=p_actor_user_id) then
    raise exception using errcode='P0002',message='account_deletion_not_found';
  end if;
  if operation.status='deletion_pending' then
    if operation.idempotency_key=p_idempotency_key then
      return app_private.account_deletion_result(operation,'replayed');
    end if;
    raise exception using errcode='P0001',message='account_deletion_idempotency_conflict';
  end if;
  if operation.status in ('deleting','deletion_failed') then
    raise exception using errcode='P0001',message='account_deletion_already_deleting';
  end if;
  if operation.status='deleted' then
    raise exception using errcode='P0002',message='account_deletion_not_found';
  end if;
  if operation.idempotency_key=p_idempotency_key and operation.operation_id is not null then
    raise exception using errcode='P0001',message='account_deletion_idempotency_conflict';
  end if;

  update public.account_deletion_operations candidate set
    operation_id=gen_random_uuid(),status='deletion_pending',
    idempotency_key=p_idempotency_key,requested_at=authoritative_now,
    due_at=authoritative_now+interval '7 days',claimed_at=null,
    lease_token=null,lease_expires_at=null,business_deleted_at=null,
    auth_delete_outcome=null,auth_receipt_fingerprint=null,
    completed_at=null,failed_at=null,failure_code=null,retry_count=0,
    recovery_generation=0,recovery_eligible_at=null,
    recovery_dispatch_token=null,recovery_dispatch_lease_expires_at=null,
    recovery_dispatched_at=null,recovery_dispatch_attempts=0,
    recovery_last_error_code=null,retry_exhausted_at=null,
    retry_exhausted_count=0,updated_at=authoritative_now
  where candidate.user_id=p_actor_user_id returning * into operation;

  perform pg_catalog.set_config('app.account_deletion_internal','on',true);
  update public.sync_runs run set
    status=case when run.status='queued' then 'cancelled' else 'failed' end,
    version=run.version+1,finished_at=authoritative_now,
    error_code=case when run.status='queued' then null else 'account_deletion_pending' end,
    error_summary=null,updated_at=authoritative_now
  where run.project_id in(select id from public.projects where user_id=p_actor_user_id)
    and run.status in('queued','running','partial');
  update public.project_sync_dispatches dispatch set
    dispatch_status='cancelled',version=dispatch.version+1,
    lease_expires_at=null,cancelled_at=authoritative_now,
    safe_error_code='account_deletion_pending',updated_at=authoritative_now
  where dispatch.project_id in(select id from public.projects where user_id=p_actor_user_id)
    and dispatch.dispatch_status in('pending','dispatching');
  update public.github_webhook_deliveries delivery set
    status=case when delivery.status='processing' then 'failed' else 'ignored' end,
    dispatch_lease_until=null,processing_lease_until=null,
    safe_error_code=case when delivery.status='processing' then 'account_deletion_pending' else delivery.safe_error_code end,
    version=delivery.version+1,updated_at=authoritative_now
  where delivery.installation_id in(select installation_id from public.github_installations where user_id=p_actor_user_id)
    and delivery.event_name<>'installation' and delivery.status in('pending','dispatching','processing');
  update public.project_briefs brief set status='failed',failure_stage='authorization',
    error_code='account_deletion_pending',completed_at=authoritative_now
  where brief.user_id=p_actor_user_id and brief.status='pending';
  update public.ai_invocations invocation set status='failed',failure_stage='authorization',
    error_code='account_deletion_pending',completed_at=authoritative_now
  where invocation.user_id=p_actor_user_id and invocation.status='pending';
  update public.energy_reservations reservation set status='released',released_at=authoritative_now,
    failure_stage='authorization',error_code='account_deletion_pending'
  where reservation.user_id=p_actor_user_id and reservation.status='reserved';
  insert into public.energy_ledger_entries(
    user_id,project_id,business_date,idempotency_key,entry_type,amount,delta,
    reservation_id,invocation_id,metadata
  ) select reservation.user_id,reservation.project_id,reservation.business_date,
    'energy-reservation:'||reservation.id::text||':released','released',
    reservation.amount,reservation.amount,reservation.id,
    (select invocation.id from public.ai_invocations invocation
      where invocation.reservation_id=reservation.id order by invocation.created_at,invocation.id limit 1),
    jsonb_build_object('reason','account_deletion_pending','contract_version','account-deletion.v1')
  from public.energy_reservations reservation
  where reservation.user_id=p_actor_user_id and reservation.status='released'
    and reservation.error_code='account_deletion_pending'
  on conflict(reservation_id,entry_type) do nothing;

  perform pg_catalog.set_config('app.account_deletion_internal','off',true);
  return app_private.account_deletion_result(operation,'executed');
end;
$$;

create or replace function public.cancel_account_deletion(
  p_actor_user_id uuid,p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
  authoritative_now timestamptz:=clock_timestamp(); previous_status text;
begin
  perform 1 from public.github_installations installation
  where installation.user_id=p_actor_user_id order by installation.id for update;
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.user_id=p_actor_user_id and candidate.operation_id=p_operation_id for update;
  if not found then raise exception using errcode='P0002',message='account_deletion_not_found'; end if;
  if operation.status not in('active','deletion_pending') then
    raise exception using errcode='P0001',message='account_deletion_cancel_window_closed';
  end if;
  if operation.status='deletion_pending' and authoritative_now>=operation.due_at then
    raise exception using errcode='P0001',message='account_deletion_cancel_window_closed';
  end if;
  previous_status:=operation.status;
  update public.account_deletion_operations candidate set
    status='active',lease_token=null,lease_expires_at=null,claimed_at=null,
    recovery_generation=0,recovery_eligible_at=null,
    recovery_dispatch_token=null,recovery_dispatch_lease_expires_at=null,
    recovery_dispatched_at=null,recovery_dispatch_attempts=0,
    recovery_last_error_code=null,retry_exhausted_at=null,
    retry_exhausted_count=0,updated_at=authoritative_now
  where candidate.user_id=p_actor_user_id returning * into operation;
  return app_private.account_deletion_result(
    operation,case when previous_status='active' then 'replayed' else 'cancelled' end
  );
end;
$$;

create or replace function public.mark_account_deletion_retry_exhausted(
  p_operation_id uuid,p_generation integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
  authoritative_now timestamptz:=clock_timestamp(); eligible_at timestamptz;
begin
  if p_operation_id is null or p_generation is null or p_generation<0 then
    raise exception using errcode='P0001',message='account_deletion_recovery_invalid';
  end if;
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('outcome','completed','status','deleted'); end if;
  if operation.status='deleted' then return app_private.account_deletion_result(operation,'completed'); end if;
  if operation.status='active' then return app_private.account_deletion_result(operation,'cancelled'); end if;
  if operation.status not in('deletion_pending','deleting','deletion_failed') then
    raise exception using errcode='P0001',message='account_deletion_recovery_invalid';
  end if;
  if p_generation<operation.recovery_generation then
    return app_private.account_deletion_result(operation,'replayed');
  end if;
  if p_generation<>operation.recovery_generation then
    raise exception using errcode='P0001',message='account_deletion_recovery_generation_conflict';
  end if;
  eligible_at:=greatest(
    authoritative_now,
    operation.due_at,
    coalesce(operation.lease_expires_at,authoritative_now)
  );
  update public.account_deletion_operations candidate set
    recovery_generation=candidate.recovery_generation+1,
    recovery_eligible_at=eligible_at,
    recovery_dispatch_token=null,recovery_dispatch_lease_expires_at=null,
    recovery_dispatched_at=null,recovery_last_error_code=null,
    retry_exhausted_at=authoritative_now,
    retry_exhausted_count=candidate.retry_exhausted_count+1,
    updated_at=authoritative_now
  where candidate.operation_id=p_operation_id returning * into operation;
  return app_private.account_deletion_result(operation,'retry_exhausted');
end;
$$;

create or replace function public.claim_account_deletion_recoveries(
  p_limit integer,p_lease_duration interval
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare authoritative_now timestamptz:=clock_timestamp(); operations jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>50
    or p_lease_duration<interval '30 seconds' or p_lease_duration>interval '5 minutes' then
    raise exception using errcode='P0001',message='account_deletion_recovery_invalid';
  end if;
  with candidates as (
    select candidate.user_id
    from public.account_deletion_operations candidate
    where candidate.status in('deletion_pending','deleting','deletion_failed')
      and candidate.operation_id is not null
      and candidate.recovery_generation>0
      and candidate.retry_exhausted_at is not null
      and candidate.due_at<=authoritative_now
      and candidate.recovery_eligible_at<=authoritative_now
      and (candidate.recovery_dispatch_token is null
        or candidate.recovery_dispatch_lease_expires_at<=authoritative_now)
    order by candidate.recovery_eligible_at,candidate.user_id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.account_deletion_operations operation set
      recovery_dispatch_token=gen_random_uuid(),
      recovery_dispatch_lease_expires_at=authoritative_now+p_lease_duration,
      recovery_dispatch_attempts=operation.recovery_dispatch_attempts+1,
      updated_at=authoritative_now
    from candidates
    where operation.user_id=candidates.user_id
    returning operation.operation_id,operation.recovery_generation,
      operation.recovery_dispatch_token,operation.due_at,
      operation.recovery_eligible_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId',claimed.operation_id,
    'generation',claimed.recovery_generation,
    'dispatchToken',claimed.recovery_dispatch_token,
    'dueAt',claimed.due_at
  ) order by claimed.recovery_eligible_at,claimed.operation_id),'[]'::jsonb)
  into operations from claimed;
  return jsonb_build_object('outcome','claimed','operations',operations);
end;
$$;

create or replace function public.complete_account_deletion_recovery_dispatch(
  p_operation_id uuid,p_generation integer,p_dispatch_token uuid,
  p_outcome text,p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
  authoritative_now timestamptz:=clock_timestamp();
begin
  if p_outcome not in('dispatched','dispatch_failed')
    or (p_outcome='dispatched' and p_error_code is not null)
    or (p_outcome='dispatch_failed' and p_error_code is distinct from 'account_deletion_recovery_dispatch_failed') then
    raise exception using errcode='P0001',message='account_deletion_recovery_invalid';
  end if;
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.operation_id=p_operation_id for update;
  if not found or operation.status='deleted' then
    return jsonb_build_object('outcome','completed','status','deleted');
  end if;
  if operation.status='active' then
    return app_private.account_deletion_result(operation,'cancelled');
  end if;
  if operation.status not in('deletion_pending','deleting','deletion_failed') then
    raise exception using errcode='P0001',message='account_deletion_recovery_invalid';
  end if;
  if operation.recovery_generation<>p_generation
    or operation.recovery_dispatch_token is distinct from p_dispatch_token then
    raise exception using errcode='P0001',message='account_deletion_recovery_lease_conflict';
  end if;
  update public.account_deletion_operations candidate set
    recovery_dispatch_token=null,recovery_dispatch_lease_expires_at=null,
    recovery_dispatched_at=case when p_outcome='dispatched' then authoritative_now else candidate.recovery_dispatched_at end,
    recovery_eligible_at=case when p_outcome='dispatched' then null else authoritative_now+interval '5 minutes' end,
    recovery_last_error_code=p_error_code,updated_at=authoritative_now
  where candidate.operation_id=p_operation_id returning * into operation;
  return app_private.account_deletion_result(operation,
    case when p_outcome='dispatched' then 'dispatched' else 'retry_scheduled' end);
end;
$$;

alter function public.request_account_deletion(uuid,text,text) owner to postgres;
alter function public.cancel_account_deletion(uuid,uuid) owner to postgres;
alter function public.mark_account_deletion_retry_exhausted(uuid,integer) owner to postgres;
alter function public.claim_account_deletion_recoveries(integer,interval) owner to postgres;
alter function public.complete_account_deletion_recovery_dispatch(uuid,integer,uuid,text,text) owner to postgres;

revoke all on function public.request_account_deletion(uuid,text,text),
  public.cancel_account_deletion(uuid,uuid),
  public.mark_account_deletion_retry_exhausted(uuid,integer),
  public.claim_account_deletion_recoveries(integer,interval),
  public.complete_account_deletion_recovery_dispatch(uuid,integer,uuid,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.request_account_deletion(uuid,text,text),
  public.cancel_account_deletion(uuid,uuid)
to authenticated,service_role;
grant execute on function public.mark_account_deletion_retry_exhausted(uuid,integer),
  public.claim_account_deletion_recoveries(integer,interval),
  public.complete_account_deletion_recovery_dispatch(uuid,integer,uuid,text,text)
to service_role;

comment on index public.account_deletion_recovery_eligible_idx is
  'Bounded durable recovery lookup for due retry-exhausted pending, deleting, and failed account deletion operations.';
comment on function public.mark_account_deletion_retry_exhausted(uuid,integer) is
  'Idempotently marks the same finite worker generation exhausted, including failures before the first due-operation claim.';
comment on function public.claim_account_deletion_recoveries(integer,interval) is
  'Claims only database-due retry-exhausted operations with current generation and row-level SKIP LOCKED leases.';
comment on function public.cancel_account_deletion(uuid,uuid) is
  'Cancels only an unclaimed pending deletion inside its database-authoritative window and clears all old recovery scheduling state.';
