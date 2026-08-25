-- logical_migration_id: 0029
-- contract_versions: account-deletion.v1, account-deletion-storage.v1
-- purpose: Phase 3.1 Webhook residual cleanup and durable retry-exhausted recovery

alter table public.account_deletion_operations
  add column recovery_generation integer not null default 0,
  add column recovery_eligible_at timestamptz,
  add column recovery_dispatch_token uuid,
  add column recovery_dispatch_lease_expires_at timestamptz,
  add column recovery_dispatched_at timestamptz,
  add column recovery_dispatch_attempts integer not null default 0,
  add column recovery_last_error_code text,
  add column retry_exhausted_at timestamptz,
  add column retry_exhausted_count integer not null default 0,
  add constraint account_deletion_recovery_generation_check check (recovery_generation>=0),
  add constraint account_deletion_recovery_attempts_check check (recovery_dispatch_attempts>=0 and retry_exhausted_count>=0),
  add constraint account_deletion_recovery_lease_check check (
    (recovery_dispatch_token is null and recovery_dispatch_lease_expires_at is null)
    or (recovery_dispatch_token is not null and recovery_dispatch_lease_expires_at is not null)
  ),
  add constraint account_deletion_recovery_error_check check (
    recovery_last_error_code is null
    or recovery_last_error_code='account_deletion_recovery_dispatch_failed'
  );

create index account_deletion_recovery_eligible_idx
on public.account_deletion_operations(recovery_eligible_at,user_id)
where recovery_eligible_at is not null and status in('deleting','deletion_failed');

comment on column public.account_deletion_operations.recovery_generation is
  'Low-cardinality generation used to create a new idempotent worker event only after the preceding finite worker retries are exhausted.';
comment on column public.account_deletion_operations.recovery_dispatch_token is
  'Short database lease token for one bounded recovery scanner; it contains no account or provider content.';

create or replace function app_private.guard_account_derived_write()
returns trigger
language plpgsql
set search_path=''
as $$
declare target_user_id uuid;
begin
  if pg_catalog.current_setting('app.account_deletion_internal',true)='on' then
    return new;
  end if;

  case tg_table_name
    when 'users' then target_user_id:=new.id;
    when 'github_identities' then target_user_id:=new.user_id;
    when 'github_installations' then target_user_id:=new.user_id;
    when 'github_installation_states' then target_user_id:=new.user_id;
    when 'selected_repositories' then target_user_id:=new.user_id;
    when 'projects' then target_user_id:=new.user_id;
    when 'project_briefs' then target_user_id:=new.user_id;
    when 'energy_reservations' then target_user_id:=new.user_id;
    when 'ai_invocations' then target_user_id:=new.user_id;
    when 'energy_ledger_entries' then target_user_id:=new.user_id;
    when 'repository_removal_operations' then target_user_id:=new.user_id;
    when 'evidence_reference_invalidations' then target_user_id:=new.user_id;
    when 'github_webhook_deliveries' then
      select installation.user_id into target_user_id
      from public.github_installations installation
      where installation.installation_id=new.installation_id
      for update;
    else
      select project.user_id into target_user_id
      from public.projects project where project.id=new.project_id;
  end case;

  perform app_private.lock_account_write_gate(target_user_id);
  return new;
end;
$$;

create or replace function app_private.account_deletion_result(
  operation public.account_deletion_operations,p_outcome text
)
returns jsonb
language sql
stable
set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'operationId',operation.operation_id,
    'status',operation.status,
    'outcome',p_outcome,
    'requestedAt',operation.requested_at,
    'dueAt',operation.due_at,
    'claimedAt',operation.claimed_at,
    'completedAt',operation.completed_at,
    'failureCode',operation.failure_code,
    'recoveryGeneration',operation.recovery_generation,
    'recoveryEligibleAt',operation.recovery_eligible_at,
    'retryExhaustedCount',operation.retry_exhausted_count,
    'recoveryDispatchAttempts',operation.recovery_dispatch_attempts,
    'safelyRetryable',operation.status in ('deletion_pending','deleting','deletion_failed')
  ));
$$;

create or replace function public.cleanup_account_business_data(
  p_operation_id uuid,p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype; deleted_users integer;
  authoritative_now timestamptz:=clock_timestamp();
begin
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.operation_id=p_operation_id;
  if not found then raise exception using errcode='P0002',message='account_deletion_not_found'; end if;
  perform 1 from public.github_installations installation
  where installation.user_id=operation.user_id order by installation.id for update;
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.operation_id=p_operation_id for update;
  if operation.status<>'deleting' or operation.lease_token is distinct from p_lease_token
    or operation.lease_expires_at<=authoritative_now then
    raise exception using errcode='P0001',message='account_deletion_lease_conflict';
  end if;
  if operation.business_deleted_at is not null then
    return jsonb_build_object('outcome','already_absent','deletedRows',0,'deletedWebhookRows',0);
  end if;
  perform pg_catalog.set_config('app.account_deletion_internal','on',true);

  -- Freeze ownership before project/Installation FKs disappear. Both branches are
  -- required for legacy rows with only one surviving relationship.
  delete from public.github_webhook_deliveries delivery
  where delivery.project_id in(
      select project.id from public.projects project where project.user_id=operation.user_id
    )
    or delivery.installation_id in(
      select installation.installation_id from public.github_installations installation
      where installation.user_id=operation.user_id
    );

  delete from public.energy_ledger_entries where user_id=operation.user_id;
  delete from public.evidence_reference_invalidations where user_id=operation.user_id;
  delete from public.ai_invocations where user_id=operation.user_id;
  delete from public.project_briefs where user_id=operation.user_id;
  delete from public.energy_reservations where user_id=operation.user_id;
  delete from public.repository_removal_operations where user_id=operation.user_id;
  delete from public.users where id=operation.user_id;
  get diagnostics deleted_users=row_count;
  update public.account_deletion_operations candidate set business_deleted_at=authoritative_now,
    updated_at=authoritative_now where candidate.operation_id=p_operation_id;
  perform pg_catalog.set_config('app.account_deletion_internal','off',true);
  return jsonb_build_object(
    'outcome',case when deleted_users=1 then 'deleted' else 'already_absent' end,
    'deletedRows',deleted_users
  );
exception when foreign_key_violation or restrict_violation or check_violation then
  raise exception using errcode='P0001',message='account_deletion_business_cleanup_failed';
end;
$$;

create function public.mark_account_deletion_retry_exhausted(
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
  if p_generation<operation.recovery_generation then
    return app_private.account_deletion_result(operation,'replayed');
  end if;
  if p_generation<>operation.recovery_generation then
    raise exception using errcode='P0001',message='account_deletion_recovery_generation_conflict';
  end if;
  eligible_at:=greatest(
    authoritative_now,
    coalesce(operation.due_at,authoritative_now),
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

create function public.claim_account_deletion_recoveries(
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
    where candidate.status in('deleting','deletion_failed')
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
      operation.recovery_dispatch_token,operation.recovery_eligible_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'operationId',claimed.operation_id,
    'generation',claimed.recovery_generation,
    'dispatchToken',claimed.recovery_dispatch_token,
    'dueAt',authoritative_now
  ) order by claimed.recovery_eligible_at,claimed.operation_id),'[]'::jsonb)
  into operations from claimed;
  return jsonb_build_object('outcome','claimed','operations',operations);
end;
$$;

create function public.complete_account_deletion_recovery_dispatch(
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

create or replace function public.complete_account_deletion(
  p_operation_id uuid,p_lease_token uuid,p_outcome text,
  p_receipt_fingerprint text,p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
  authoritative_now timestamptz:=clock_timestamp();
begin
  if p_outcome not in('auth_deleted','auth_already_absent','auth_failed','business_failed')
    or (p_receipt_fingerprint is not null and p_receipt_fingerprint!~'^[0-9a-f]{64}$') then
    raise exception using errcode='P0001',message='account_deletion_completion_invalid';
  end if;
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.operation_id=p_operation_id for update;
  if not found then raise exception using errcode='P0002',message='account_deletion_not_found'; end if;
  if operation.status='deleted' then return app_private.account_deletion_result(operation,'replayed'); end if;
  if operation.status<>'deleting' or operation.lease_token is distinct from p_lease_token then
    raise exception using errcode='P0001',message='account_deletion_lease_conflict';
  end if;
  if p_outcome in('auth_deleted','auth_already_absent') then
    if operation.business_deleted_at is null then
      raise exception using errcode='P0001',message='account_deletion_business_cleanup_required';
    end if;
    update public.account_deletion_operations candidate set status='deleted',
      auth_delete_outcome=p_outcome,auth_receipt_fingerprint=p_receipt_fingerprint,
      completed_at=authoritative_now,failed_at=null,failure_code=null,
      lease_token=null,lease_expires_at=null,
      recovery_eligible_at=null,recovery_dispatch_token=null,
      recovery_dispatch_lease_expires_at=null,recovery_last_error_code=null,
      updated_at=authoritative_now
    where candidate.operation_id=p_operation_id returning * into operation;
    return app_private.account_deletion_result(operation,'completed');
  end if;
  update public.account_deletion_operations candidate set status='deletion_failed',
    auth_delete_outcome=case when p_outcome='auth_failed' then p_outcome else candidate.auth_delete_outcome end,
    auth_receipt_fingerprint=p_receipt_fingerprint,failed_at=authoritative_now,
    failure_code=case when p_outcome='business_failed' then 'account_deletion_business_cleanup_failed'
      else 'account_deletion_auth_identity_delete_failed' end,
    lease_token=null,lease_expires_at=null,updated_at=authoritative_now
  where candidate.operation_id=p_operation_id returning * into operation;
  return app_private.account_deletion_result(operation,'failed');
end;
$$;

alter function app_private.guard_account_derived_write() owner to postgres;
alter function app_private.account_deletion_result(public.account_deletion_operations,text) owner to postgres;
alter function public.cleanup_account_business_data(uuid,uuid) owner to postgres;
alter function public.mark_account_deletion_retry_exhausted(uuid,integer) owner to postgres;
alter function public.claim_account_deletion_recoveries(integer,interval) owner to postgres;
alter function public.complete_account_deletion_recovery_dispatch(uuid,integer,uuid,text,text) owner to postgres;
alter function public.complete_account_deletion(uuid,uuid,text,text,text) owner to postgres;

revoke all on function app_private.guard_account_derived_write(),
  app_private.account_deletion_result(public.account_deletion_operations,text)
from public,anon,authenticated,service_role;
revoke all on function public.cleanup_account_business_data(uuid,uuid),
  public.mark_account_deletion_retry_exhausted(uuid,integer),
  public.claim_account_deletion_recoveries(integer,interval),
  public.complete_account_deletion_recovery_dispatch(uuid,integer,uuid,text,text),
  public.complete_account_deletion(uuid,uuid,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.cleanup_account_business_data(uuid,uuid),
  public.mark_account_deletion_retry_exhausted(uuid,integer),
  public.claim_account_deletion_recoveries(integer,interval),
  public.complete_account_deletion_recovery_dispatch(uuid,integer,uuid,text,text),
  public.complete_account_deletion(uuid,uuid,text,text,text)
to service_role;

comment on function public.mark_account_deletion_retry_exhausted(uuid,integer) is
  'Idempotently converts one exhausted finite worker generation into a database-timed recovery candidate; it never marks deletion complete.';
comment on function public.claim_account_deletion_recoveries(integer,interval) is
  'Claims at most fifty retry-exhausted account deletion operations with row-level SKIP LOCKED leases for a bounded recovery scan.';
comment on function public.complete_account_deletion_recovery_dispatch(uuid,integer,uuid,text,text) is
  'Records only dispatched or retry-scheduled outcomes; provider dispatch is never confused with account deletion completion.';
