-- logical_migration_id: 0028
-- contract_versions: account-deletion.v1, account-deletion-storage.v1
-- purpose: seven-day, retryable account deletion lifecycle

create table public.account_deletion_operations (
  user_id uuid primary key,
  operation_id uuid unique,
  status text not null default 'active',
  idempotency_key text,
  requested_at timestamptz,
  due_at timestamptz,
  claimed_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  business_deleted_at timestamptz,
  auth_delete_outcome text,
  auth_receipt_fingerprint text,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  retry_count integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint account_deletion_status_check check (
    status in ('active','deletion_pending','deleting','deleted','deletion_failed')
  ),
  constraint account_deletion_idempotency_check check (
    idempotency_key is null or (
      idempotency_key=btrim(idempotency_key)
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$'
    )
  ),
  constraint account_deletion_time_check check (
    (status='active') or
    (operation_id is not null and idempotency_key is not null
      and requested_at is not null and due_at=requested_at+interval '7 days')
  ),
  constraint account_deletion_lease_check check (
    (lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null and claimed_at is not null)
  ),
  constraint account_deletion_receipt_check check (
    auth_receipt_fingerprint is null
    or auth_receipt_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint account_deletion_retry_count_check check (retry_count>=0)
);

comment on table public.account_deletion_operations is
  'One content-free account lifecycle tombstone per internal user. user_id deliberately has no FK so retry state survives deletion of public.users and auth.users.';
comment on column public.account_deletion_operations.auth_receipt_fingerprint is
  'SHA-256 fingerprint of a low-cardinality Auth Admin outcome; never a token, email, provider payload, or user profile.';

create index account_deletion_due_idx
on public.account_deletion_operations(due_at,user_id)
where status='deletion_pending';
create index account_deletion_retry_idx
on public.account_deletion_operations(updated_at,user_id)
where status in ('deleting','deletion_failed');

alter table public.account_deletion_operations enable row level security;
alter table public.account_deletion_operations force row level security;
revoke all on table public.account_deletion_operations
from public,anon,authenticated,service_role;

alter table public.project_sync_dispatches
  drop constraint project_sync_dispatches_safe_error_code_check,
  drop constraint project_sync_dispatches_state_check,
  add constraint project_sync_dispatches_safe_error_code_check check (
    safe_error_code is null
    or safe_error_code in ('authorization_revoked','account_deletion_pending')
  ),
  add constraint project_sync_dispatches_state_check check (
    (dispatch_status='pending' and lease_expires_at is null and provider_job_id is null
      and dispatched_at is null and cancelled_at is null and safe_error_code is null)
    or (dispatch_status='dispatching' and lease_expires_at is not null and provider_job_id is null
      and dispatched_at is null and cancelled_at is null and safe_error_code is null)
    or (dispatch_status='dispatched' and lease_expires_at is null and provider_job_id is not null
      and dispatched_at is not null and cancelled_at is null and safe_error_code is null)
    or (dispatch_status='cancelled' and lease_expires_at is null and provider_job_id is null
      and dispatched_at is null and cancelled_at is not null
      and safe_error_code in ('authorization_revoked','account_deletion_pending'))
  );

insert into public.account_deletion_operations(user_id,status)
select id,'active' from public.users
on conflict(user_id) do nothing;

create function app_private.ensure_account_lifecycle_row()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.account_deletion_operations(user_id,status)
  values(new.id,'active')
  on conflict(user_id) do nothing;
  return new;
end;
$$;

create trigger users_ensure_account_lifecycle
after insert on public.users
for each row execute function app_private.ensure_account_lifecycle_row();

create function app_private.lock_account_write_gate(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare account_status text;
begin
  if p_user_id is null
    or pg_catalog.current_setting('app.account_deletion_internal',true)='on'
  then return;
  end if;

  select operation.status into account_status
  from public.account_deletion_operations operation
  where operation.user_id=p_user_id
  for update;
  if found and account_status<>'active' then
    raise exception using errcode='P0001',message='account_deletion_pending';
  end if;
end;
$$;

create function app_private.guard_account_derived_write()
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
      if new.event_name='installation' then return new; end if;
      select installation.user_id into target_user_id
      from public.github_installations installation
      where installation.installation_id=new.installation_id;
    else
      select project.user_id into target_user_id
      from public.projects project where project.id=new.project_id;
  end case;

  perform app_private.lock_account_write_gate(target_user_id);
  return new;
end;
$$;

create trigger account_gate_users before insert or update on public.users
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_identities before insert or update on public.github_identities
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_installations before insert or update on public.github_installations
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_installation_states before insert or update on public.github_installation_states
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_selected_repositories before insert or update on public.selected_repositories
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_projects before insert or update on public.projects
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_repository_snapshots before insert or update on public.github_repository_snapshots
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_commits before insert or update on public.github_commits
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_issues before insert or update on public.github_issues
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_pull_requests before insert or update on public.github_pull_requests
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_releases before insert or update on public.github_releases
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_workflow_runs before insert or update on public.github_workflow_runs
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_document_snapshots before insert or update on public.github_document_snapshots
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_sync_runs before insert or update on public.sync_runs
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_project_sync_dispatches before insert or update on public.project_sync_dispatches
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_github_webhook_deliveries before insert or update on public.github_webhook_deliveries
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_project_briefs before insert or update on public.project_briefs
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_energy_reservations before insert or update on public.energy_reservations
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_ai_invocations before insert or update on public.ai_invocations
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_energy_ledger_entries before insert or update on public.energy_ledger_entries
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_repository_removal_operations before insert or update on public.repository_removal_operations
for each row execute function app_private.guard_account_derived_write();
create trigger account_gate_evidence_reference_invalidations before insert or update on public.evidence_reference_invalidations
for each row execute function app_private.guard_account_derived_write();

create or replace function app_private.prevent_energy_ledger_mutation()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='DELETE'
    and current_user='postgres'
    and pg_catalog.current_setting('app.account_deletion_internal',true)='on'
  then return old;
  end if;
  if tg_op='UPDATE'
    and current_user='postgres'
    and old.project_id is not null and new.project_id is null
    and new.reservation_id is null and new.invocation_id is null
    and old.repository_removal_operation_id is null
    and new.repository_removal_operation_id is not null
    and old.project_reference_removed_at is null
    and new.project_reference_removed_at is not null
    and new.id is not distinct from old.id
    and new.user_id is not distinct from old.user_id
    and new.business_date is not distinct from old.business_date
    and new.idempotency_key is not distinct from old.idempotency_key
    and new.entry_type is not distinct from old.entry_type
    and new.amount is not distinct from old.amount
    and new.delta is not distinct from old.delta
    and new.created_at is not distinct from old.created_at
    and new.metadata is not distinct from old.metadata
  then return new;
  end if;
  raise exception using errcode='P0001',message='energy_ledger_immutable';
end;
$$;

create function app_private.account_deletion_result(operation public.account_deletion_operations,p_outcome text)
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
    'safelyRetryable',operation.status in ('deletion_pending','deleting','deletion_failed')
  ));
$$;

create function public.request_account_deletion(
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
    updated_at=authoritative_now
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

create function public.get_account_deletion_status(p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
begin
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.user_id=p_actor_user_id;
  if not found then raise exception using errcode='P0002',message='account_deletion_not_found'; end if;
  return app_private.account_deletion_result(operation,'observed');
end;
$$;

create function public.cancel_account_deletion(p_actor_user_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
begin
  perform 1 from public.github_installations installation
  where installation.user_id=p_actor_user_id order by installation.id for update;
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.user_id=p_actor_user_id and candidate.operation_id=p_operation_id for update;
  if not found then raise exception using errcode='P0002',message='account_deletion_not_found'; end if;
  if operation.status='active' then return app_private.account_deletion_result(operation,'replayed'); end if;
  if operation.status<>'deletion_pending' or clock_timestamp()>=operation.due_at then
    raise exception using errcode='P0001',message='account_deletion_cancel_window_closed';
  end if;
  update public.account_deletion_operations candidate set status='active',
    lease_token=null,lease_expires_at=null,claimed_at=null,updated_at=clock_timestamp()
  where candidate.user_id=p_actor_user_id returning * into operation;
  return app_private.account_deletion_result(operation,'cancelled');
end;
$$;

create function public.claim_account_deletion(p_operation_id uuid,p_lease_duration interval)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare operation public.account_deletion_operations%rowtype;
  authoritative_now timestamptz:=clock_timestamp(); new_lease uuid;
begin
  if p_operation_id is null or p_lease_duration<interval '30 seconds'
    or p_lease_duration>interval '15 minutes' then
    raise exception using errcode='P0001',message='account_deletion_claim_invalid';
  end if;
  select candidate.* into operation from public.account_deletion_operations candidate
  where candidate.operation_id=p_operation_id for update;
  if not found then return jsonb_build_object('outcome','not_found','status','deleted'); end if;
  if operation.status='deleted' then return app_private.account_deletion_result(operation,'completed'); end if;
  if operation.status='active' then return app_private.account_deletion_result(operation,'cancelled'); end if;
  if operation.status='deletion_pending' and authoritative_now<operation.due_at then
    return app_private.account_deletion_result(operation,'not_due');
  end if;
  if operation.status='deleting' and operation.lease_expires_at>authoritative_now then
    return app_private.account_deletion_result(operation,'lease_conflict');
  end if;
  if operation.status not in('deletion_pending','deleting','deletion_failed') then
    raise exception using errcode='P0001',message='account_deletion_claim_conflict';
  end if;
  new_lease:=gen_random_uuid();
  update public.account_deletion_operations candidate set status='deleting',
    claimed_at=authoritative_now,lease_token=new_lease,
    lease_expires_at=authoritative_now+p_lease_duration,
    failed_at=null,failure_code=null,retry_count=candidate.retry_count+1,
    updated_at=authoritative_now
  where candidate.operation_id=p_operation_id returning * into operation;
  return app_private.account_deletion_result(operation,'claimed')||jsonb_build_object(
    'userId',operation.user_id,'leaseToken',operation.lease_token
  );
end;
$$;

create function public.cleanup_account_business_data(p_operation_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path=''
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
    return jsonb_build_object('outcome','already_absent','deletedRows',0);
  end if;
  perform pg_catalog.set_config('app.account_deletion_internal','on',true);
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
  return jsonb_build_object('outcome',case when deleted_users=1 then 'deleted' else 'already_absent' end,'deletedRows',deleted_users);
exception when foreign_key_violation or restrict_violation or check_violation then
  raise exception using errcode='P0001',message='account_deletion_business_cleanup_failed';
end;
$$;

create function public.complete_account_deletion(
  p_operation_id uuid,p_lease_token uuid,p_outcome text,
  p_receipt_fingerprint text,p_error_code text
)
returns jsonb language plpgsql security definer set search_path=''
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
      lease_token=null,lease_expires_at=null,updated_at=authoritative_now
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

create or replace function public.ensure_user_identity(
  p_auth_user_id uuid,p_github_user_id bigint,p_github_login varchar(255),p_avatar_url text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare existing_github_user_id bigint; existing_user_id uuid;
  normalized_github_login varchar(255):=btrim(p_github_login); account_status text;
begin
  if p_github_user_id<=0 then raise exception using errcode='22023',message='invalid_github_user_id'; end if;
  if normalized_github_login is null or normalized_github_login='' then raise exception using errcode='22023',message='invalid_github_login'; end if;
  if p_avatar_url is not null and (char_length(p_avatar_url)>2048 or p_avatar_url!~'^https?://[^[:space:]]+$') then
    raise exception using errcode='22023',message='invalid_avatar_url'; end if;
  perform 1 from auth.users auth_user where auth_user.id=p_auth_user_id for update;
  if not found then raise exception using errcode='P0002',message='auth_user_not_found'; end if;
  select operation.status into account_status from public.account_deletion_operations operation
  where operation.user_id=p_auth_user_id for update;
  if found and account_status<>'active' then raise exception using errcode='P0001',message='account_deletion_pending'; end if;
  select identity.github_user_id into existing_github_user_id from public.github_identities identity
  where identity.user_id=p_auth_user_id for update;
  if found then
    if existing_github_user_id<>p_github_user_id then raise exception using errcode='P0001',message='identity_auth_user_conflict'; end if;
    update public.github_identities set github_login=normalized_github_login,avatar_url=p_avatar_url where user_id=p_auth_user_id;
    return p_auth_user_id;
  end if;
  select identity.user_id into existing_user_id from public.github_identities identity
  where identity.github_user_id=p_github_user_id for update;
  if found then raise exception using errcode='P0001',message='identity_github_user_conflict'; end if;
  insert into public.users(id) values(p_auth_user_id) on conflict(id) do nothing;
  begin
    insert into public.github_identities(user_id,github_user_id,github_login,avatar_url)
    values(p_auth_user_id,p_github_user_id,normalized_github_login,p_avatar_url);
  exception when unique_violation then
    if exists(select 1 from public.github_identities identity where identity.github_user_id=p_github_user_id and identity.user_id<>p_auth_user_id) then
      raise exception using errcode='P0001',message='identity_github_user_conflict'; end if;
    raise exception using errcode='P0001',message='identity_auth_user_conflict';
  end;
  return p_auth_user_id;
end;
$$;

alter function app_private.ensure_account_lifecycle_row() owner to postgres;
alter function app_private.lock_account_write_gate(uuid) owner to postgres;
alter function app_private.guard_account_derived_write() owner to postgres;
alter function app_private.account_deletion_result(public.account_deletion_operations,text) owner to postgres;
alter function public.request_account_deletion(uuid,text,text) owner to postgres;
alter function public.get_account_deletion_status(uuid) owner to postgres;
alter function public.cancel_account_deletion(uuid,uuid) owner to postgres;
alter function public.claim_account_deletion(uuid,interval) owner to postgres;
alter function public.cleanup_account_business_data(uuid,uuid) owner to postgres;
alter function public.complete_account_deletion(uuid,uuid,text,text,text) owner to postgres;

revoke all on function app_private.ensure_account_lifecycle_row(),
  app_private.lock_account_write_gate(uuid),app_private.guard_account_derived_write(),
  app_private.account_deletion_result(public.account_deletion_operations,text)
from public,anon,authenticated,service_role;
revoke all on function public.request_account_deletion(uuid,text,text),
  public.get_account_deletion_status(uuid),public.cancel_account_deletion(uuid,uuid),
  public.claim_account_deletion(uuid,interval),public.cleanup_account_business_data(uuid,uuid),
  public.complete_account_deletion(uuid,uuid,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function public.request_account_deletion(uuid,text,text),
  public.get_account_deletion_status(uuid),public.cancel_account_deletion(uuid,uuid),
  public.claim_account_deletion(uuid,interval),public.cleanup_account_business_data(uuid,uuid),
  public.complete_account_deletion(uuid,uuid,text,text,text)
to service_role;

comment on function public.request_account_deletion(uuid,text,text) is
  'Creates or replays one seven-day account deletion request using database UTC time, after locking all owned Installations in stable order and terminalizing queued work.';
comment on function public.cleanup_account_business_data(uuid,uuid) is
  'Lease-bound, retryable business cleanup. It deletes all user-owned business rows while preserving only the content-free account deletion tombstone.';
comment on function public.complete_account_deletion(uuid,uuid,text,text,text) is
  'Records the low-cardinality Auth Admin boundary result and converges the durable lifecycle to deleted or deletion_failed.';
