-- T05: preserve existing locks, ownership and grants; extend only null eligibility
-- and the explicit v3/schema-v2 generation pair. Historical rows are not rewritten.

CREATE OR REPLACE FUNCTION public.list_reconciliation_projects(p_snapshot_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where (project_record.status in ('in_planning', 'in_development', 'polishing')
      or project_record.status is null)
  ) eligible;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_project_brief_generation(p_actor_user_id uuid, p_reservation_id uuid, p_range_start timestamp with time zone, p_range_end timestamp with time zone, p_prompt_version text, p_schema_version text, p_evidence_fingerprint text, p_payload jsonb, p_expires_at timestamp with time zone, p_provider text, p_model text, p_request_id text, p_input_tokens integer, p_output_tokens integer, p_latency_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  authenticated_user_id uuid := p_actor_user_id;
  reservation_record public.energy_reservations%rowtype;
  brief_record public.project_briefs%rowtype;
  invocation_record public.ai_invocations%rowtype;
  installation_status text;
  completed_timestamp timestamptz := pg_catalog.clock_timestamp();
begin
  if authenticated_user_id is null then
    raise exception using errcode='P0001', message='project_brief_generation_unauthenticated';
  end if;
  if p_reservation_id is null
    or p_range_start is null
    or p_range_end is null
    or p_range_end<=p_range_start
    or (
      (p_prompt_version in ('project-brief-v1','project-brief-v2')
      and p_schema_version='project-brief-schema-v1')
      or (p_prompt_version = 'project-brief-v3' and p_schema_version = 'project-brief-schema-v2')
    ) is not true
    or p_evidence_fingerprint is null
    or p_evidence_fingerprint !~ '^[0-9a-f]{64}$'
    or p_payload is null
    or jsonb_typeof(p_payload)<>'object'
    or p_expires_at is null
    or p_expires_at<=completed_timestamp
    or (p_input_tokens is not null and p_input_tokens<0)
    or (p_output_tokens is not null and p_output_tokens<0)
    or (p_latency_ms is not null and p_latency_ms<0)
  then
    raise exception using errcode='P0001', message='project_brief_generation_invalid_request';
  end if;

  select installation_record.status into installation_status
  from public.energy_reservations reservation_candidate
  join public.projects project_record
    on project_record.id=reservation_candidate.project_id
    and project_record.user_id=reservation_candidate.user_id
  join public.selected_repositories selection_record
    on selection_record.id=project_record.selected_repository_id
    and selection_record.user_id=project_record.user_id
  join public.github_installations installation_record
    on installation_record.id=selection_record.github_installation_id
    and installation_record.user_id=project_record.user_id
  where reservation_candidate.id=p_reservation_id
    and reservation_candidate.user_id=authenticated_user_id
  for update of installation_record;
  if not found then
    raise exception using errcode='P0001', message='project_brief_generation_reservation_not_found';
  end if;
  if installation_status<>'active' then
    raise exception using errcode='P0001', message='project_brief_authorization_failed';
  end if;

  select candidate.* into reservation_record
  from public.energy_reservations candidate
  where candidate.id=p_reservation_id
    and candidate.user_id=authenticated_user_id
  for update;
  if not found then
    raise exception using errcode='P0001', message='project_brief_generation_reservation_not_found';
  end if;
  if reservation_record.amount<>3 then
    raise exception using errcode='P0001', message='project_brief_generation_idempotency_conflict';
  end if;
  if p_payload->>'promptVersion' is distinct from p_prompt_version
    or p_payload->>'schemaVersion' is distinct from p_schema_version
    or p_payload->>'projectId' is distinct from reservation_record.project_id::text
    or p_payload->>'evidenceFingerprint' is distinct from p_evidence_fingerprint
    or (p_payload->>'rangeStart')::timestamptz is distinct from p_range_start
    or (p_payload->>'rangeEnd')::timestamptz is distinct from p_range_end
    or p_payload->>'boundaryNote' is distinct from
      'This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility.'
    or jsonb_typeof(p_payload->'evidenceRefs') is distinct from 'array'
    or jsonb_array_length(p_payload->'evidenceRefs')=0
    or not p_payload ?& array[
      'officialStatus','summary','completedChanges','ongoingWork',
      'openItems','riskSignals','unknowns','freshness'
    ]
  then
    raise exception using errcode='P0001', message='project_brief_generation_invalid_request';
  end if;

  if reservation_record.status='released' then
    raise exception using errcode='P0001', message='project_brief_generation_idempotency_conflict';
  end if;
  if reservation_record.status='consumed' then
    select invocation_candidate.* into invocation_record
    from public.ai_invocations invocation_candidate
    where invocation_candidate.reservation_id=reservation_record.id
      and invocation_candidate.user_id=authenticated_user_id;
    if found then
      select brief_candidate.* into brief_record
      from public.project_briefs brief_candidate
      where brief_candidate.id=invocation_record.brief_id
        and brief_candidate.user_id=authenticated_user_id;
    end if;
    if not found
      or invocation_record.status<>'completed'
      or brief_record.status<>'completed'
      or brief_record.range_start<>p_range_start
      or brief_record.range_end<>p_range_end
      or brief_record.prompt_version<>p_prompt_version
      or brief_record.schema_version<>p_schema_version
      or brief_record.evidence_fingerprint<>p_evidence_fingerprint
      or brief_record.payload<>p_payload
    then
      raise exception using errcode='P0001', message='project_brief_generation_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'status','completed','outcome','replayed',
      'reservation_id',reservation_record.id,
      'brief_id',brief_record.id,'invocation_id',invocation_record.id,
      'brief',brief_record.payload
    );
  end if;

  insert into public.project_briefs(
    user_id,project_id,range_start,range_end,prompt_version,schema_version,
    evidence_fingerprint,status,payload,completed_at,expires_at
  ) values (
    authenticated_user_id,reservation_record.project_id,p_range_start,p_range_end,
    p_prompt_version,p_schema_version,p_evidence_fingerprint,'completed',p_payload,
    completed_timestamp,p_expires_at
  ) returning * into brief_record;

  insert into public.ai_invocations(
    user_id,project_id,feature,provider,model,prompt_version,schema_version,
    input_fingerprint,status,input_tokens,output_tokens,latency_ms,cache_status,
    provider_request_id,reservation_id,brief_id,started_at,completed_at
  ) values (
    authenticated_user_id,reservation_record.project_id,'project_brief',p_provider,
    p_model,p_prompt_version,p_schema_version,p_evidence_fingerprint,'completed',
    p_input_tokens,p_output_tokens,p_latency_ms,'miss',p_request_id,
    reservation_record.id,brief_record.id,completed_timestamp,completed_timestamp
  ) returning * into invocation_record;

  update public.energy_reservations
  set status='consumed',consumed_at=completed_timestamp
  where id=reservation_record.id;

  insert into public.energy_ledger_entries(
    user_id,project_id,business_date,idempotency_key,entry_type,amount,delta,
    reservation_id,invocation_id,metadata
  ) values (
    reservation_record.user_id,reservation_record.project_id,
    reservation_record.business_date,
    'energy-reservation:'||reservation_record.id::text||':consumed',
    'consumed',reservation_record.amount,0,reservation_record.id,
    invocation_record.id,jsonb_build_object('feature','project_brief')
  );

  return jsonb_build_object(
    'status','completed','outcome','completed',
    'reservation_id',reservation_record.id,
    'brief_id',brief_record.id,'invocation_id',invocation_record.id,
    'brief',brief_record.payload
  );
exception
  when check_violation or not_null_violation or foreign_key_violation
    or unique_violation or invalid_text_representation
  then
    raise exception using errcode='P0001', message='project_brief_generation_persistence_failed';
end;
$function$;

CREATE OR REPLACE FUNCTION public.fail_project_brief_generation_with_contract(p_actor_user_id uuid, p_reservation_id uuid, p_failure_stage text, p_error_code text, p_provider text, p_model text, p_request_id text, p_prompt_version text, p_schema_version text, p_input_fingerprint text, p_cache_equivalence_fingerprint text, p_input_tokens integer, p_output_tokens integer, p_latency_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  authenticated_user_id uuid := p_actor_user_id;
  reservation_record public.energy_reservations%rowtype;
  reservation_user_id uuid;
  reservation_business_date date;
  invocation_record public.ai_invocations%rowtype;
  released_timestamp timestamptz := pg_catalog.clock_timestamp();
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_unauthenticated';
  end if;
  if p_reservation_id is null
    or p_failure_stage is null
    or p_failure_stage not in (
      'provider', 'schema_validation', 'evidence_validation',
      'persistence', 'energy_consume', 'idempotency_conflict'
    )
    or p_error_code is null
    or p_error_code not in (
      'project_brief_provider_failure', 'project_brief_empty_output',
      'project_brief_parse_failure', 'project_brief_schema_validation_failed',
      'project_brief_evidence_validation_failed',
      'project_brief_persistence_failed', 'project_brief_energy_consume_failed',
      'project_brief_idempotency_conflict'
    )
    or (
      (p_prompt_version in ('project-brief-v1', 'project-brief-v2')
      and p_schema_version = 'project-brief-schema-v1')
      or (p_prompt_version = 'project-brief-v3' and p_schema_version = 'project-brief-schema-v2')
    ) is not true
    or p_input_fingerprint is null
    or p_input_fingerprint !~ '^[0-9a-f]{64}$'
    or p_cache_equivalence_fingerprint is null
    or p_cache_equivalence_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_input_tokens is not null and p_input_tokens < 0)
    or (p_output_tokens is not null and p_output_tokens < 0)
    or (p_latency_ms is not null and p_latency_ms < 0)
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_invalid_request';
  end if;

  select candidate.user_id, candidate.business_date
  into reservation_user_id, reservation_business_date
  from public.energy_reservations candidate
  where candidate.id = p_reservation_id
    and candidate.user_id = authenticated_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_reservation_not_found';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      reservation_user_id::text || ':' || reservation_business_date::text,
      29
    )
  );
  select candidate.* into reservation_record
  from public.energy_reservations candidate
  where candidate.id = p_reservation_id
    and candidate.user_id = authenticated_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_reservation_not_found';
  end if;
  if reservation_record.amount <> 3 or reservation_record.status = 'consumed' then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
  end if;

  if reservation_record.status = 'released' then
    select candidate.* into invocation_record
    from public.ai_invocations candidate
    where candidate.reservation_id = reservation_record.id
      and candidate.user_id = authenticated_user_id;
    if not found
      or reservation_record.failure_stage is distinct from p_failure_stage
      or reservation_record.error_code is distinct from p_error_code
      or invocation_record.status <> 'failed'
      or invocation_record.failure_stage is distinct from p_failure_stage
      or invocation_record.error_code is distinct from p_error_code
      or invocation_record.provider is distinct from p_provider
      or invocation_record.model is distinct from p_model
      or invocation_record.provider_request_id is distinct from p_request_id
      or invocation_record.prompt_version is distinct from p_prompt_version
      or invocation_record.schema_version is distinct from p_schema_version
      or invocation_record.input_fingerprint is distinct from p_input_fingerprint
      or invocation_record.cache_equivalence_fingerprint is distinct from p_cache_equivalence_fingerprint
      or invocation_record.input_tokens is distinct from p_input_tokens
      or invocation_record.output_tokens is distinct from p_output_tokens
      or invocation_record.latency_ms is distinct from p_latency_ms
    then
      raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'status', 'failed',
      'outcome', 'replayed',
      'reservation_id', reservation_record.id,
      'failure_stage', reservation_record.failure_stage,
      'error_code', reservation_record.error_code
    );
  end if;

  insert into public.ai_invocations (
    user_id, project_id, feature, provider, model,
    prompt_version, schema_version, input_fingerprint,
    cache_equivalence_fingerprint, status, provider_request_id,
    input_tokens, output_tokens, latency_ms, cache_status,
    failure_stage, error_code, reservation_id, started_at, completed_at
  ) values (
    authenticated_user_id, reservation_record.project_id, 'project_brief',
    p_provider, p_model, p_prompt_version, p_schema_version,
    p_input_fingerprint, p_cache_equivalence_fingerprint, 'failed', p_request_id,
    p_input_tokens, p_output_tokens, p_latency_ms, 'miss',
    p_failure_stage, p_error_code, reservation_record.id,
    released_timestamp, released_timestamp
  ) returning * into invocation_record;

  update public.energy_reservations
  set status = 'released',
      released_at = released_timestamp,
      failure_stage = p_failure_stage,
      error_code = p_error_code
  where id = reservation_record.id;

  insert into public.energy_ledger_entries (
    user_id, project_id, business_date, idempotency_key,
    entry_type, amount, delta, reservation_id, invocation_id,
    metadata
  ) values (
    reservation_record.user_id, reservation_record.project_id,
    reservation_record.business_date,
    'energy-reservation:' || reservation_record.id::text || ':released',
    'released', reservation_record.amount, reservation_record.amount,
    reservation_record.id, invocation_record.id,
    jsonb_build_object('feature', 'project_brief', 'failure_stage', p_failure_stage)
  );

  return jsonb_build_object(
    'status', 'failed',
    'outcome', 'released',
    'reservation_id', reservation_record.id,
    'failure_stage', p_failure_stage,
    'error_code', p_error_code
  );
exception
  when check_violation or not_null_violation or foreign_key_violation
    or unique_violation
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_persistence_failed';
end;
$function$;
