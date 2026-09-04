-- logical_migration_id: 0023
-- contract_versions: repository-removal.v1, repository-removal-storage.v1
-- purpose: atomically remove repository-derived data or a complete project
--          subtree while preserving minimal audit and account ledger facts

alter table public.projects
  add column repository_data_state text not null default 'connected',
  add column repository_data_version bigint not null default 1,
  add column repository_removed_at timestamptz,
  add constraint projects_repository_data_state_check check (
    repository_data_state in ('connected', 'removing', 'removed')
  ),
  add constraint projects_repository_data_version_check check (
    repository_data_version > 0
  ),
  add constraint projects_repository_removed_at_check check (
    (repository_data_state = 'connected' and repository_removed_at is null)
    or (repository_data_state = 'removing' and repository_removed_at is null)
    or (repository_data_state = 'removed' and repository_removed_at is not null)
  );

comment on column public.projects.repository_data_state is
  'Write fence for repository-derived synchronization and AI data. Removed projects retain user-authored calibration only.';
comment on column public.projects.repository_data_version is
  'Monotonic repository-data generation used to reject stale derived writes.';
comment on column public.projects.repository_removed_at is
  'Completion time of REMOVE_REPOSITORY_DATA; null while repository data remains connected or removal is in flight.';

create index projects_repository_data_state_idx
on public.projects (repository_data_state, updated_at desc, id);

create table public.repository_removal_operations (
  id uuid constraint repository_removal_operations_pkey
    primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  target_project_id uuid not null,
  mode text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  status text not null default 'executing',
  failure_stage text,
  error_code text,
  safely_retryable boolean not null default true,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint repository_removal_operations_idempotency_key
    unique (user_id, idempotency_key),
  constraint repository_removal_operations_mode_check check (
    mode in ('REMOVE_REPOSITORY_DATA', 'DELETE_PROJECT_SUBTREE')
  ),
  constraint repository_removal_operations_idempotency_check check (
    idempotency_key = btrim(idempotency_key)
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$'
  ),
  constraint repository_removal_operations_fingerprint_check check (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint repository_removal_operations_status_check check (
    status in ('executing', 'completed', 'failed')
  ),
  constraint repository_removal_operations_failure_check check (
    (status = 'executing' and failure_stage is null and error_code is null
      and completed_at is null and result is null)
    or (status = 'completed' and failure_stage is null and error_code is null
      and completed_at is not null and result is not null)
    or (status = 'failed' and failure_stage is not null and error_code is not null
      and completed_at is not null and result is null)
  ),
  constraint repository_removal_operations_failure_labels_check check (
    (failure_stage is null or failure_stage ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
    and (error_code is null or error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$')
  ),
  constraint repository_removal_operations_result_check check (
    result is null or jsonb_typeof(result) = 'object'
  )
);

comment on table public.repository_removal_operations is
  'Minimal idempotency tombstones and audit counts for repository removal. Source, document, prompt, response, token and credential content are excluded.';

create index repository_removal_operations_project_created_idx
on public.repository_removal_operations (
  user_id, target_project_id, created_at desc, id desc
);
create unique index repository_removal_operations_one_executing_project_idx
on public.repository_removal_operations (target_project_id)
where status = 'executing';

create table public.evidence_reference_invalidations (
  id uuid constraint evidence_reference_invalidations_pkey
    primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  target_project_id uuid not null,
  repository_removal_operation_id uuid not null
    references public.repository_removal_operations(id) on delete restrict,
  source_kind text not null,
  source_id text not null,
  source_version text,
  reference_fingerprint text not null,
  invalidation_reason text not null default 'SOURCE_REMOVED',
  invalidated_at timestamptz not null,
  constraint evidence_reference_invalidations_operation_reference_key
    unique (repository_removal_operation_id, reference_fingerprint),
  constraint evidence_reference_invalidations_labels_check check (
    source_kind = btrim(source_kind)
    and source_kind ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$'
    and source_id = btrim(source_id)
    and source_id <> ''
    and char_length(source_id) <= 1024
    and (source_version is null or (
      source_version = btrim(source_version)
      and source_version <> ''
      and char_length(source_version) <= 255
    ))
  ),
  constraint evidence_reference_invalidations_fingerprint_check check (
    reference_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint evidence_reference_invalidations_reason_check check (
    invalidation_reason = 'SOURCE_REMOVED'
  )
);

comment on table public.evidence_reference_invalidations is
  'Minimal identifiers for evidence links invalidated because their repository-backed source was removed. Evidence content is excluded.';

create index evidence_reference_invalidations_project_idx
on public.evidence_reference_invalidations (
  user_id, target_project_id, invalidated_at desc, id desc
);

alter table public.repository_removal_operations enable row level security;
alter table public.repository_removal_operations force row level security;
alter table public.evidence_reference_invalidations enable row level security;
alter table public.evidence_reference_invalidations force row level security;

revoke all on table public.repository_removal_operations
from public, anon, authenticated, service_role;
revoke all on table public.evidence_reference_invalidations
from public, anon, authenticated, service_role;

create policy repository_removal_operations_select_own
on public.repository_removal_operations for select to authenticated
using (user_id = (select auth.uid()));
create policy evidence_reference_invalidations_select_own
on public.evidence_reference_invalidations for select to authenticated
using (user_id = (select auth.uid()));

grant select on table public.repository_removal_operations to authenticated;
grant select on table public.evidence_reference_invalidations to authenticated;

alter table public.energy_ledger_entries
  add column repository_removal_operation_id uuid
    references public.repository_removal_operations(id) on delete restrict,
  add column project_reference_removed_at timestamptz;

comment on column public.energy_ledger_entries.repository_removal_operation_id is
  'Minimal removal audit link set only when project, reservation and invocation references are detached.';
comment on column public.energy_ledger_entries.project_reference_removed_at is
  'Time at which project-owned lineage was detached while the immutable account accounting fact was preserved.';

alter table public.energy_ledger_entries
  drop constraint energy_ledger_entries_lineage_check,
  add constraint energy_ledger_entries_lineage_check check (
    (
      entry_type = 'grant'
      and project_id is null
      and reservation_id is null
      and invocation_id is null
      and repository_removal_operation_id is null
      and project_reference_removed_at is null
    )
    or (
      entry_type in ('reserved', 'consumed', 'released')
      and project_id is not null
      and reservation_id is not null
      and repository_removal_operation_id is null
      and project_reference_removed_at is null
    )
    or (
      entry_type in ('reserved', 'consumed', 'released')
      and project_id is null
      and reservation_id is null
      and invocation_id is null
      and repository_removal_operation_id is not null
      and project_reference_removed_at is not null
    )
  );

create or replace function app_private.prevent_energy_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and current_user = 'postgres'
    and old.project_id is not null
    and new.project_id is null
    and new.reservation_id is null
    and new.invocation_id is null
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
  then
    return new;
  end if;

  raise exception using errcode = 'P0001', message = 'energy_ledger_immutable';
end;
$$;

create function app_private.guard_repository_derived_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  project_state text;
begin
  if new.project_id is null then
    return new;
  end if;

  select project_record.repository_data_state
  into project_state
  from public.projects project_record
  where project_record.id = new.project_id
  for key share;

  if not found then
    return new;
  end if;

  if project_state <> 'connected' then
    raise exception using errcode = 'P0001', message = 'repository_data_unavailable';
  end if;

  return new;
end;
$$;

create trigger github_repository_snapshots_repository_write_guard
before insert or update on public.github_repository_snapshots
for each row execute function app_private.guard_repository_derived_write();
create trigger github_commits_repository_write_guard
before insert or update on public.github_commits
for each row execute function app_private.guard_repository_derived_write();
create trigger github_issues_repository_write_guard
before insert or update on public.github_issues
for each row execute function app_private.guard_repository_derived_write();
create trigger github_pull_requests_repository_write_guard
before insert or update on public.github_pull_requests
for each row execute function app_private.guard_repository_derived_write();
create trigger github_releases_repository_write_guard
before insert or update on public.github_releases
for each row execute function app_private.guard_repository_derived_write();
create trigger github_workflow_runs_repository_write_guard
before insert or update on public.github_workflow_runs
for each row execute function app_private.guard_repository_derived_write();
create trigger github_document_snapshots_repository_write_guard
before insert or update on public.github_document_snapshots
for each row execute function app_private.guard_repository_derived_write();
create trigger sync_runs_repository_write_guard
before insert or update on public.sync_runs
for each row execute function app_private.guard_repository_derived_write();
create trigger project_sync_dispatches_repository_write_guard
before insert or update on public.project_sync_dispatches
for each row execute function app_private.guard_repository_derived_write();
create trigger github_webhook_deliveries_repository_write_guard
before insert or update on public.github_webhook_deliveries
for each row execute function app_private.guard_repository_derived_write();
create trigger project_briefs_repository_write_guard
before insert or update on public.project_briefs
for each row execute function app_private.guard_repository_derived_write();
create trigger energy_reservations_repository_write_guard
before insert or update on public.energy_reservations
for each row execute function app_private.guard_repository_derived_write();
create trigger ai_invocations_repository_write_guard
before insert or update on public.ai_invocations
for each row execute function app_private.guard_repository_derived_write();

comment on function app_private.guard_repository_derived_write() is
  'Takes a key-share project lock and rejects inserts or updates after repository removal has acquired its exclusive project lock.';

create function public.execute_repository_removal(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_mode text,
  p_idempotency_key text,
  p_confirmation_project_id uuid,
  p_confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_record public.repository_removal_operations%rowtype;
  project_record public.projects%rowtype;
  request_fingerprint text;
  expected_confirmation text;
  completed_time timestamptz;
  counts_value jsonb;
  result_value jsonb;
  deleted_github_repository_snapshots bigint := 0;
  deleted_github_commits bigint := 0;
  deleted_github_issues bigint := 0;
  deleted_github_pull_requests bigint := 0;
  deleted_github_releases bigint := 0;
  deleted_github_workflow_runs bigint := 0;
  deleted_github_document_snapshots bigint := 0;
  deleted_sync_runs bigint := 0;
  deleted_project_sync_dispatches bigint := 0;
  deleted_project_briefs bigint := 0;
  deleted_ai_invocations bigint := 0;
  deleted_energy_reservations bigint := 0;
  invalidated_evidence_links bigint := 0;
  invalidated_webhook_deliveries bigint := 0;
  preserved_energy_ledger_entries bigint := 0;
begin
  if p_actor_user_id is null
    or p_project_id is null
    or p_mode not in ('REMOVE_REPOSITORY_DATA', 'DELETE_PROJECT_SUBTREE')
    or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$'
    or p_confirmation_project_id is null
    or p_confirmation_text is null
  then
    return jsonb_build_object(
      'status', 'failed', 'safelyRetryable', false,
      'error', jsonb_build_object('code', 'repository_removal_precondition_failed')
    );
  end if;

  expected_confirmation := case p_mode
    when 'REMOVE_REPOSITORY_DATA' then 'REMOVE ' || p_project_id::text
    else 'DELETE ' || p_project_id::text
  end;
  if p_confirmation_project_id <> p_project_id
    or p_confirmation_text <> expected_confirmation
  then
    return jsonb_build_object(
      'status', 'failed', 'safelyRetryable', false,
      'error', jsonb_build_object(
        'code', 'repository_removal_confirmation_mismatch'
      )
    );
  end if;

  request_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        p_actor_user_id::text || pg_catalog.chr(31)
          || p_project_id::text || pg_catalog.chr(31)
          || p_mode || pg_catalog.chr(31)
          || p_confirmation_project_id::text || pg_catalog.chr(31)
          || p_confirmation_text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_user_id::text || ':' || p_idempotency_key,
      61
    )
  );

  select candidate.*
  into operation_record
  from public.repository_removal_operations candidate
  where candidate.user_id = p_actor_user_id
    and candidate.idempotency_key = p_idempotency_key
  for update;

  if found then
    if operation_record.request_fingerprint <> request_fingerprint then
      return jsonb_build_object(
        'status', 'failed', 'safelyRetryable', false,
        'error', jsonb_build_object('code', 'repository_removal_conflict')
      );
    end if;
    if operation_record.status = 'completed' then
      return operation_record.result || jsonb_build_object('outcome', 'replayed');
    end if;
    if operation_record.status = 'executing' then
      return jsonb_build_object(
        'operationId', operation_record.id,
        'status', 'failed', 'safelyRetryable', true,
        'error', jsonb_build_object('code', 'repository_removal_conflict')
      );
    end if;

    begin
      update public.repository_removal_operations
      set status = 'executing', failure_stage = null, error_code = null,
        completed_at = null, result = null
      where id = operation_record.id
      returning * into operation_record;
    exception
      when unique_violation then
        return jsonb_build_object(
          'operationId', operation_record.id,
          'status', 'failed', 'safelyRetryable', true,
          'error', jsonb_build_object('code', 'repository_removal_conflict')
        );
    end;
  else
    begin
      insert into public.repository_removal_operations (
        user_id, target_project_id, mode, idempotency_key, request_fingerprint
      ) values (
        p_actor_user_id, p_project_id, p_mode,
        p_idempotency_key, request_fingerprint
      )
      returning * into operation_record;
    exception
      when unique_violation then
        return jsonb_build_object(
          'status', 'failed', 'safelyRetryable', true,
          'error', jsonb_build_object('code', 'repository_removal_conflict')
        );
    end;
  end if;

  begin
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_project_id::text, 62)
    );

    select candidate.*
    into project_record
    from public.projects candidate
    where candidate.id = p_project_id
      and candidate.user_id = p_actor_user_id
    for update;

    if not found then
      update public.repository_removal_operations
      set status = 'failed', failure_stage = 'ownership_check',
        error_code = 'repository_removal_not_found', completed_at = now(),
        safely_retryable = false
      where id = operation_record.id;
      return jsonb_build_object(
        'operationId', operation_record.id,
        'status', 'failed', 'safelyRetryable', false,
        'error', jsonb_build_object('code', 'repository_removal_not_found')
      );
    end if;

    if exists (
      select 1
      from public.repository_removal_operations prior_operation
      where prior_operation.user_id = p_actor_user_id
        and prior_operation.target_project_id = p_project_id
        and prior_operation.id <> operation_record.id
        and prior_operation.status = 'completed'
        and prior_operation.mode <> p_mode
    ) then
      update public.repository_removal_operations
      set status = 'failed', failure_stage = 'mode_conflict',
        error_code = 'repository_removal_conflict', completed_at = now(),
        safely_retryable = false
      where id = operation_record.id;
      return jsonb_build_object(
        'operationId', operation_record.id,
        'status', 'failed', 'safelyRetryable', false,
        'error', jsonb_build_object('code', 'repository_removal_conflict')
      );
    end if;

    if p_mode = 'REMOVE_REPOSITORY_DATA'
      and project_record.repository_data_state = 'removed'
    then
      select prior_operation.result || jsonb_build_object(
        'operationId', operation_record.id, 'outcome', 'replayed'
      )
      into result_value
      from public.repository_removal_operations prior_operation
      where prior_operation.user_id = p_actor_user_id
        and prior_operation.target_project_id = p_project_id
        and prior_operation.mode = p_mode
        and prior_operation.status = 'completed'
      order by prior_operation.completed_at desc, prior_operation.id desc
      limit 1;

      if result_value is null then
        update public.repository_removal_operations
        set status = 'failed', failure_stage = 'state_check',
          error_code = 'repository_removal_precondition_failed',
          completed_at = now(), safely_retryable = false
        where id = operation_record.id;
        return jsonb_build_object(
          'operationId', operation_record.id,
          'status', 'failed', 'safelyRetryable', false,
          'error', jsonb_build_object(
            'code', 'repository_removal_precondition_failed'
          )
        );
      end if;

      update public.repository_removal_operations
      set status = 'completed', completed_at = now(),
        safely_retryable = true, result = result_value
      where id = operation_record.id;
      return result_value;
    end if;

    update public.projects
    set repository_data_state = 'removing',
      repository_data_version = repository_data_version + 1,
      repository_removed_at = null
    where id = p_project_id;

    insert into public.evidence_reference_invalidations (
      user_id, target_project_id, repository_removal_operation_id,
      source_kind, source_id, source_version, reference_fingerprint,
      invalidated_at
    )
    select distinct on (reference_fingerprint)
      p_actor_user_id,
      p_project_id,
      operation_record.id,
      reference_record->>'sourceKind',
      reference_record->>'sourceId',
      nullif(reference_record->>'sourceVersion', ''),
      reference_fingerprint,
      now()
    from public.project_briefs brief_record
    cross join lateral jsonb_path_query(
      brief_record.payload,
      'lax $.**.evidenceRefs[*]'
    ) reference_record
    cross join lateral (
      select pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(reference_record::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) reference_fingerprint
    ) fingerprint_record
    where brief_record.project_id = p_project_id
      and jsonb_typeof(reference_record) = 'object'
      and jsonb_typeof(reference_record->'sourceKind') = 'string'
      and jsonb_typeof(reference_record->'sourceId') = 'string'
      and reference_record->>'sourceKind'
        ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$'
      and btrim(reference_record->>'sourceId') <> ''
      and char_length(reference_record->>'sourceId') <= 1024
    order by reference_fingerprint
    on conflict (
      repository_removal_operation_id, reference_fingerprint
    ) do nothing;
    get diagnostics invalidated_evidence_links = row_count;

    update public.github_webhook_deliveries
    set project_id = null,
      sync_run_id = null,
      status = 'ignored',
      dispatch_lease_until = null,
      processing_lease_until = null,
      provider_receipt_id = null,
      safe_error_code = null,
      version = version + 1
    where project_id = p_project_id;
    get diagnostics invalidated_webhook_deliveries = row_count;

    insert into public.energy_ledger_entries (
      user_id, project_id, business_date, idempotency_key,
      entry_type, amount, delta, reservation_id
    )
    select reservation_record.user_id,
      reservation_record.project_id,
      reservation_record.business_date,
      'repository-removal:' || operation_record.id::text
        || ':reservation:' || reservation_record.id::text || ':released',
      'released', reservation_record.amount, reservation_record.amount,
      reservation_record.id
    from public.energy_reservations reservation_record
    where reservation_record.project_id = p_project_id
      and reservation_record.status = 'reserved';

    update public.energy_ledger_entries ledger_record
    set project_id = null,
      reservation_id = null,
      invocation_id = null,
      repository_removal_operation_id = operation_record.id,
      project_reference_removed_at = now()
    where ledger_record.project_id = p_project_id;
    get diagnostics preserved_energy_ledger_entries = row_count;

    delete from public.project_sync_dispatches
    where project_id = p_project_id;
    get diagnostics deleted_project_sync_dispatches = row_count;

    delete from public.sync_runs where project_id = p_project_id;
    get diagnostics deleted_sync_runs = row_count;

    delete from public.ai_invocations where project_id = p_project_id;
    get diagnostics deleted_ai_invocations = row_count;

    delete from public.energy_reservations where project_id = p_project_id;
    get diagnostics deleted_energy_reservations = row_count;

    delete from public.project_briefs where project_id = p_project_id;
    get diagnostics deleted_project_briefs = row_count;

    delete from public.github_document_snapshots where project_id = p_project_id;
    get diagnostics deleted_github_document_snapshots = row_count;
    delete from public.github_workflow_runs where project_id = p_project_id;
    get diagnostics deleted_github_workflow_runs = row_count;
    delete from public.github_releases where project_id = p_project_id;
    get diagnostics deleted_github_releases = row_count;
    delete from public.github_pull_requests where project_id = p_project_id;
    get diagnostics deleted_github_pull_requests = row_count;
    delete from public.github_issues where project_id = p_project_id;
    get diagnostics deleted_github_issues = row_count;
    delete from public.github_commits where project_id = p_project_id;
    get diagnostics deleted_github_commits = row_count;
    delete from public.github_repository_snapshots where project_id = p_project_id;
    get diagnostics deleted_github_repository_snapshots = row_count;

    if p_mode = 'REMOVE_REPOSITORY_DATA' then
      update public.projects
      set repository_data_state = 'removed', repository_removed_at = now()
      where id = p_project_id;
    else
      delete from public.projects where id = p_project_id;
    end if;

    completed_time := now();
    counts_value := jsonb_build_object(
      'deleted', jsonb_build_object(
        'github_repository_snapshots', deleted_github_repository_snapshots,
        'github_commits', deleted_github_commits,
        'github_issues', deleted_github_issues,
        'github_pull_requests', deleted_github_pull_requests,
        'github_releases', deleted_github_releases,
        'github_workflow_runs', deleted_github_workflow_runs,
        'github_document_snapshots', deleted_github_document_snapshots,
        'sync_runs', deleted_sync_runs,
        'project_sync_dispatches', deleted_project_sync_dispatches,
        'project_briefs', deleted_project_briefs,
        'ai_invocations', deleted_ai_invocations,
        'energy_reservations', deleted_energy_reservations,
        'projects', case when p_mode = 'DELETE_PROJECT_SUBTREE' then 1 else 0 end
      ),
      'preserved', jsonb_build_object(
        'projects', case when p_mode = 'REMOVE_REPOSITORY_DATA' then 1 else 0 end,
        'selected_repositories', 1,
        'github_installations', 1,
        'energy_ledger_entries', preserved_energy_ledger_entries,
        'repository_removal_operations', 1
      ),
      'invalidated', jsonb_build_object(
        'evidence_links', invalidated_evidence_links,
        'webhook_deliveries', invalidated_webhook_deliveries
      )
    );
    result_value := jsonb_build_object(
      'operationId', operation_record.id,
      'projectId', p_project_id,
      'mode', p_mode,
      'status', 'completed',
      'outcome', 'executed',
      'counts', counts_value,
      'safelyRetryable', true,
      'completedAt', completed_time
    );

    update public.repository_removal_operations
    set status = 'completed', safely_retryable = true,
      completed_at = completed_time, result = result_value
    where id = operation_record.id;

    return result_value;
  exception
    when unique_violation then
      update public.repository_removal_operations
      set status = 'failed', failure_stage = 'concurrency_control',
        error_code = 'repository_removal_conflict', completed_at = now(),
        safely_retryable = true
      where id = operation_record.id;
      return jsonb_build_object(
        'operationId', operation_record.id,
        'status', 'failed', 'safelyRetryable', true,
        'error', jsonb_build_object('code', 'repository_removal_conflict')
      );
    when others then
      update public.repository_removal_operations
      set status = 'failed', failure_stage = 'database_transaction',
        error_code = 'repository_removal_storage_failed', completed_at = now(),
        safely_retryable = true
      where id = operation_record.id;
      return jsonb_build_object(
        'operationId', operation_record.id,
        'status', 'failed', 'safelyRetryable', true,
        'error', jsonb_build_object(
          'code', 'repository_removal_storage_failed'
        )
      );
  end;
end;
$$;

comment on function public.execute_repository_removal(
  uuid, uuid, text, text, uuid, text
) is
  'Service-only, idempotent repository removal transaction. It verifies ownership without enumeration, fences late writes, explicitly detaches immutable account ledger facts, invalidates evidence identifiers and stores only minimal audit counts.';

alter function app_private.prevent_energy_ledger_mutation() owner to postgres;
alter function app_private.guard_repository_derived_write() owner to postgres;
alter function public.execute_repository_removal(
  uuid, uuid, text, text, uuid, text
) owner to postgres;

revoke all on function app_private.prevent_energy_ledger_mutation()
from public, anon, authenticated, service_role;
revoke all on function app_private.guard_repository_derived_write()
from public, anon, authenticated, service_role;
revoke all on function public.execute_repository_removal(
  uuid, uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.execute_repository_removal(
  uuid, uuid, text, text, uuid, text
) to service_role;
