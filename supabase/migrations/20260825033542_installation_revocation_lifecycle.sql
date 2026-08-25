-- logical_migration_id: 0026
-- contract_versions: github-installation-revocation.v1,
--                    github-webhook-delivery-processing.v1,
--                    synchronization-state.v1,
--                    daily-project-brief-energy-grant.v1
-- purpose: make a trusted installation.deleted completion monotonic,
--          idempotent and atomic with cancellation of installation-scoped work

alter table public.project_sync_dispatches
  add column cancelled_at timestamptz,
  add column safe_error_code text;

alter table public.project_sync_dispatches
  drop constraint project_sync_dispatches_status_check,
  drop constraint project_sync_dispatches_state_check,
  add constraint project_sync_dispatches_status_check check (
    dispatch_status in ('pending', 'dispatching', 'dispatched', 'cancelled')
  ),
  add constraint project_sync_dispatches_safe_error_code_check check (
    safe_error_code is null or safe_error_code = 'authorization_revoked'
  ),
  add constraint project_sync_dispatches_state_check check (
    (
      dispatch_status = 'pending'
      and lease_expires_at is null and provider_job_id is null
      and dispatched_at is null and cancelled_at is null
      and safe_error_code is null
    )
    or (
      dispatch_status = 'dispatching'
      and lease_expires_at is not null and provider_job_id is null
      and dispatched_at is null and cancelled_at is null
      and safe_error_code is null
    )
    or (
      dispatch_status = 'dispatched'
      and lease_expires_at is null and provider_job_id is not null
      and dispatched_at is not null and cancelled_at is null
      and safe_error_code is null
    )
    or (
      dispatch_status = 'cancelled'
      and lease_expires_at is null and provider_job_id is null
      and dispatched_at is null and cancelled_at is not null
      and safe_error_code = 'authorization_revoked'
    )
  );

comment on column public.project_sync_dispatches.cancelled_at is
  'Authoritative terminal time for never-dispatched work cancelled after installation revocation.';
comment on column public.project_sync_dispatches.safe_error_code is
  'Low-cardinality cancellation reason; no provider payload, credentials or repository content.';

create or replace function public.complete_github_webhook_installation(
  p_delivery_id uuid,
  p_expected_version bigint,
  p_installation_state text,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_delivery public.github_webhook_deliveries%rowtype;
  target_installation public.github_installations%rowtype;
  installation_transitions integer := 0;
  cancelled_sync_runs integer := 0;
  cancelled_dispatches integer := 0;
  ignored_webhooks integer := 0;
  failed_processing_webhooks integer := 0;
  failed_briefs integer := 0;
  failed_invocations integer := 0;
  released_reservations integer := 0;
begin
  if p_delivery_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_completed_at is null
    or p_installation_state not in ('active','suspended','revoked')
  then
    raise exception using errcode='P0001', message='github_webhook_installation_state_invalid';
  end if;

  select candidate.* into target_delivery
  from public.github_webhook_deliveries candidate
  where candidate.delivery_id=p_delivery_id
    and candidate.version=p_expected_version
    and candidate.status='pending'
    and candidate.event_name='installation'
  for update;
  if not found then
    raise exception using errcode='P0001', message='github_webhook_delivery_concurrency_conflict';
  end if;

  select candidate.* into target_installation
  from public.github_installations candidate
  where candidate.installation_id=target_delivery.installation_id
  for update;

  if p_installation_state='revoked' then
    update public.github_installations installation_record
    set status='revoked',
        suspended_at=null,
        revoked_at=p_completed_at
    where installation_record.id=target_installation.id
      and installation_record.status<>'revoked';
    get diagnostics installation_transitions = row_count;

    if installation_transitions = 1 then
      update public.sync_runs run_record
      set status=case when run_record.status='queued' then 'cancelled' else 'failed' end,
          version=run_record.version+1,
          finished_at=p_completed_at,
          error_code=case when run_record.status='queued' then null else 'github_activity_authorization_revoked' end,
          error_summary=null,
          updated_at=p_completed_at
      where run_record.project_id in (
        select project_record.id
        from public.projects project_record
        join public.selected_repositories selection_record
          on selection_record.id=project_record.selected_repository_id
        where selection_record.github_installation_id=target_installation.id
      )
        and run_record.status in ('queued','running','partial');
      get diagnostics cancelled_sync_runs = row_count;

      update public.project_sync_dispatches dispatch_record
      set dispatch_status='cancelled',
          version=dispatch_record.version+1,
          lease_expires_at=null,
          cancelled_at=p_completed_at,
          safe_error_code='authorization_revoked',
          updated_at=p_completed_at
      where dispatch_record.project_id in (
        select project_record.id
        from public.projects project_record
        join public.selected_repositories selection_record
          on selection_record.id=project_record.selected_repository_id
        where selection_record.github_installation_id=target_installation.id
      )
        and dispatch_record.dispatch_status in ('pending','dispatching');
      get diagnostics cancelled_dispatches = row_count;

      update public.github_webhook_deliveries delivery_record
      set status='ignored',
          dispatch_lease_until=null,
          version=delivery_record.version+1,
          updated_at=p_completed_at
      where delivery_record.installation_id=target_installation.installation_id
        and delivery_record.event_name<>'installation'
        and delivery_record.status in ('pending','dispatching');
      get diagnostics ignored_webhooks = row_count;

      update public.github_webhook_deliveries delivery_record
      set status='failed',
          processing_lease_until=null,
          safe_error_code='github_activity_authorization_revoked',
          version=delivery_record.version+1,
          updated_at=p_completed_at
      where delivery_record.installation_id=target_installation.installation_id
        and delivery_record.event_name<>'installation'
        and delivery_record.status='processing';
      get diagnostics failed_processing_webhooks = row_count;

      update public.project_briefs brief_record
      set status='failed',
          failure_stage='authorization',
          error_code='project_brief_authorization_failed',
          completed_at=p_completed_at
      where brief_record.project_id in (
        select project_record.id
        from public.projects project_record
        join public.selected_repositories selection_record
          on selection_record.id=project_record.selected_repository_id
        where selection_record.github_installation_id=target_installation.id
      )
        and brief_record.status='pending';
      get diagnostics failed_briefs = row_count;

      update public.ai_invocations invocation_record
      set status='failed',
          failure_stage='authorization',
          error_code='project_brief_authorization_failed',
          completed_at=p_completed_at
      where invocation_record.project_id in (
        select project_record.id
        from public.projects project_record
        join public.selected_repositories selection_record
          on selection_record.id=project_record.selected_repository_id
        where selection_record.github_installation_id=target_installation.id
      )
        and invocation_record.status='pending';
      get diagnostics failed_invocations = row_count;

      update public.energy_reservations reservation_record
      set status='released',
          released_at=p_completed_at,
          failure_stage='authorization',
          error_code='project_brief_authorization_failed'
      where reservation_record.project_id in (
        select project_record.id
        from public.projects project_record
        join public.selected_repositories selection_record
          on selection_record.id=project_record.selected_repository_id
        where selection_record.github_installation_id=target_installation.id
      )
        and reservation_record.status='reserved';
      get diagnostics released_reservations = row_count;

      insert into public.energy_ledger_entries(
        user_id,project_id,business_date,idempotency_key,
        entry_type,amount,delta,reservation_id,invocation_id,metadata
      )
      select reservation_record.user_id,
             reservation_record.project_id,
             reservation_record.business_date,
             'energy-reservation:' || reservation_record.id::text || ':released',
             'released',reservation_record.amount,reservation_record.amount,
             reservation_record.id,
             (
               select invocation_record.id
               from public.ai_invocations invocation_record
               where invocation_record.reservation_id=reservation_record.id
               order by invocation_record.created_at,invocation_record.id
               limit 1
             ),
             jsonb_build_object(
               'feature','project_brief',
               'reason','authorization_revoked',
               'contract_version','github-installation-revocation.v1'
             )
      from public.energy_reservations reservation_record
      where reservation_record.project_id in (
        select project_record.id
        from public.projects project_record
        join public.selected_repositories selection_record
          on selection_record.id=project_record.selected_repository_id
        where selection_record.github_installation_id=target_installation.id
      )
        and reservation_record.status='released'
        and reservation_record.failure_stage='authorization'
        and reservation_record.error_code='project_brief_authorization_failed'
      on conflict (reservation_id,entry_type) do nothing;
    end if;
  elsif p_installation_state='suspended' then
    update public.github_installations installation_record
    set status='suspended',suspended_at=p_completed_at,revoked_at=null
    where installation_record.id=target_installation.id
      and installation_record.status<>'revoked';
  else
    update public.github_installations installation_record
    set status='active',suspended_at=null,revoked_at=null
    where installation_record.id=target_installation.id
      and installation_record.status='suspended';
  end if;

  update public.github_webhook_deliveries delivery_record
  set status='completed',version=delivery_record.version+1,updated_at=p_completed_at
  where delivery_record.delivery_id=p_delivery_id
    and delivery_record.version=p_expected_version
    and delivery_record.status='pending';
  if not found then
    raise exception using errcode='P0001', message='github_webhook_delivery_concurrency_conflict';
  end if;

  return jsonb_build_object(
    'completed',true,
    'installation_transitions',installation_transitions,
    'cancelled_sync_runs',cancelled_sync_runs,
    'cancelled_dispatches',cancelled_dispatches,
    'ignored_webhooks',ignored_webhooks,
    'failed_processing_webhooks',failed_processing_webhooks,
    'failed_briefs',failed_briefs,
    'failed_invocations',failed_invocations,
    'released_reservations',released_reservations
  );
end;
$$;

comment on function public.complete_github_webhook_installation(uuid,bigint,text,timestamptz) is
  'Completes a trusted installation event; the first revoke atomically terminalizes installation-scoped queued work and releases reserved Brief energy.';

create or replace function public.create_sync_run(
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
  installation_status text;
begin
  select installation_record.status into installation_status
  from public.projects project_record
  join public.selected_repositories selection_record
    on selection_record.id=project_record.selected_repository_id
    and selection_record.user_id=project_record.user_id
  join public.github_installations installation_record
    on installation_record.id=selection_record.github_installation_id
    and installation_record.user_id=project_record.user_id
  where project_record.id=p_project_id;
  if not found then
    raise exception using errcode='P0002', message='sync_run_project_not_found';
  end if;
  if installation_status='revoked' then
    raise exception using errcode='P0001', message='sync_run_authorization_revoked';
  end if;
  if installation_status<>'active' then
    raise exception using errcode='P0001', message='sync_run_authorization_suspended';
  end if;

  insert into public.sync_runs(project_id,idempotency_key,trigger_source)
  values (p_project_id,p_idempotency_key,p_trigger_source)
  on conflict (project_id,idempotency_key) do nothing
  returning * into saved_run;
  if not found then
    select candidate.* into saved_run
    from public.sync_runs candidate
    where candidate.project_id=p_project_id
      and candidate.idempotency_key=p_idempotency_key;
  end if;
  return to_jsonb(saved_run);
exception
  when check_violation or not_null_violation then
    raise exception using errcode='P0001', message='sync_run_invalid_request';
end;
$$;

comment on function public.create_sync_run(uuid,text,text) is
  'Creates one queued SyncRun only while the project Installation is active; revoked and suspended states fail closed before insertion.';

create or replace function public.claim_project_sync_dispatch(
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
  set dispatch_status='dispatching',version=dispatch.version+1,
      lease_expires_at=p_claimed_at+interval '60 seconds'
  where dispatch.project_id=p_project_id
    and dispatch.sync_run_id=p_sync_run_id
    and dispatch.version=p_expected_version
    and (
      dispatch.dispatch_status='pending'
      or (dispatch.dispatch_status='dispatching' and dispatch.lease_expires_at<=p_claimed_at)
    )
    and exists (
      select 1
      from public.projects project_record
      join public.selected_repositories selection_record
        on selection_record.id=project_record.selected_repository_id
      join public.github_installations installation_record
        on installation_record.id=selection_record.github_installation_id
      where project_record.id=dispatch.project_id
        and installation_record.status='active'
    )
  returning * into saved;
  if found then
    return jsonb_build_object('claimed',true,'version',saved.version);
  end if;
  select * into saved from public.project_sync_dispatches dispatch
  where dispatch.project_id=p_project_id and dispatch.sync_run_id=p_sync_run_id;
  if not found then
    raise exception using errcode='P0002',message='sync_dispatch_not_found';
  end if;
  return jsonb_build_object('claimed',false,'version',saved.version);
end;
$$;

create function app_private.reject_inactive_project_energy_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.projects project_record where project_record.id=new.project_id
  ) and not exists (
    select 1
    from public.projects project_record
    join public.selected_repositories selection_record
      on selection_record.id=project_record.selected_repository_id
      and selection_record.user_id=project_record.user_id
    join public.github_installations installation_record
      on installation_record.id=selection_record.github_installation_id
      and installation_record.user_id=project_record.user_id
    where project_record.id=new.project_id
      and project_record.user_id=new.user_id
      and installation_record.status='active'
  ) then
    raise exception using errcode='P0001', message='project_brief_authorization_failed';
  end if;
  return new;
end;
$$;

create trigger energy_reservations_require_active_installation
before insert on public.energy_reservations
for each row execute function app_private.reject_inactive_project_energy_reservation();

create function app_private.reject_inactive_project_ai_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status='completed'
    and exists (
      select 1 from public.projects project_record where project_record.id=new.project_id
    )
    and not exists (
    select 1
    from public.projects project_record
    join public.selected_repositories selection_record
      on selection_record.id=project_record.selected_repository_id
      and selection_record.user_id=project_record.user_id
    join public.github_installations installation_record
      on installation_record.id=selection_record.github_installation_id
      and installation_record.user_id=project_record.user_id
    where project_record.id=new.project_id
      and project_record.user_id=new.user_id
      and installation_record.status='active'
  ) then
    raise exception using errcode='P0001', message='project_brief_authorization_failed';
  end if;
  return new;
end;
$$;

create trigger ai_invocations_require_active_installation
before insert on public.ai_invocations
for each row execute function app_private.reject_inactive_project_ai_completion();

create function app_private.reject_inactive_github_snapshot_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.projects project_record where project_record.id=new.project_id
  ) and not exists (
    select 1
    from public.projects project_record
    join public.selected_repositories selection_record
      on selection_record.id=project_record.selected_repository_id
      and selection_record.user_id=project_record.user_id
    join public.github_installations installation_record
      on installation_record.id=selection_record.github_installation_id
      and installation_record.user_id=project_record.user_id
    where project_record.id=new.project_id
      and installation_record.status='active'
  ) then
    raise exception using errcode='P0001', message='github_activity_authorization_revoked';
  end if;
  return new;
end;
$$;

create trigger github_repository_snapshots_require_active_installation
before insert or update on public.github_repository_snapshots
for each row execute function app_private.reject_inactive_github_snapshot_write();
create trigger github_commits_require_active_installation
before insert or update on public.github_commits
for each row execute function app_private.reject_inactive_github_snapshot_write();
create trigger github_issues_require_active_installation
before insert or update on public.github_issues
for each row execute function app_private.reject_inactive_github_snapshot_write();
create trigger github_pull_requests_require_active_installation
before insert or update on public.github_pull_requests
for each row execute function app_private.reject_inactive_github_snapshot_write();
create trigger github_releases_require_active_installation
before insert or update on public.github_releases
for each row execute function app_private.reject_inactive_github_snapshot_write();
create trigger github_workflow_runs_require_active_installation
before insert or update on public.github_workflow_runs
for each row execute function app_private.reject_inactive_github_snapshot_write();

revoke all on function app_private.reject_inactive_project_energy_reservation(),
  app_private.reject_inactive_project_ai_completion(),
  app_private.reject_inactive_github_snapshot_write()
from public,anon,authenticated,service_role;

revoke all on function public.complete_github_webhook_installation(uuid,bigint,text,timestamptz),
  public.create_sync_run(uuid,text,text),
  public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)
from public,anon,authenticated,service_role;
grant execute on function public.complete_github_webhook_installation(uuid,bigint,text,timestamptz),
  public.create_sync_run(uuid,text,text),
  public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)
to service_role;
