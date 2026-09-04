-- logical_migration_id: 0024
-- contract_versions: repository-removal.v1,
--                    repository-removal-storage.v1
-- purpose: allow a completed repository-data removal to be followed by a
--          separately confirmed project-subtree deletion while preserving
--          the existing concurrent-mode conflict boundary

create or replace function public.execute_repository_removal(
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
  request_started_time timestamptz := pg_catalog.clock_timestamp();
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
  deleted_evidence_reference_invalidations bigint := 0;
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
    ) and (
      p_mode <> 'DELETE_PROJECT_SUBTREE'
      or project_record.repository_data_state <> 'removed'
      or exists (
        select 1
        from public.repository_removal_operations prior_operation
        where prior_operation.user_id = p_actor_user_id
          and prior_operation.target_project_id = p_project_id
          and prior_operation.id <> operation_record.id
          and prior_operation.status = 'completed'
          and prior_operation.mode = 'REMOVE_REPOSITORY_DATA'
          and prior_operation.completed_at > request_started_time
      )
    ) then
      update public.repository_removal_operations
      set status = 'failed', failure_stage = 'mode_conflict',
        error_code = 'repository_removal_conflict',
        completed_at = pg_catalog.clock_timestamp(),
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
          completed_at = pg_catalog.clock_timestamp(), safely_retryable = false
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
      set status = 'completed', completed_at = pg_catalog.clock_timestamp(),
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
      delete from public.evidence_reference_invalidations
      where target_project_id = p_project_id
        and user_id = p_actor_user_id;
      get diagnostics deleted_evidence_reference_invalidations = row_count;

      delete from public.projects where id = p_project_id;
    end if;

    completed_time := pg_catalog.clock_timestamp();
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
        'evidence_reference_invalidations',
          deleted_evidence_reference_invalidations,
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
        error_code = 'repository_removal_conflict',
        completed_at = pg_catalog.clock_timestamp(),
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
        error_code = 'repository_removal_storage_failed',
        completed_at = pg_catalog.clock_timestamp(),
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
  'Service-only, idempotent repository removal transaction. Sequential project deletion after completed repository-data removal is allowed, while concurrent modes still conflict. Deleted projects retain only minimal operation tombstones.';

alter function public.execute_repository_removal(
  uuid, uuid, text, text, uuid, text
) owner to postgres;

revoke all on function public.execute_repository_removal(
  uuid, uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.execute_repository_removal(
  uuid, uuid, text, text, uuid, text
) to service_role;
