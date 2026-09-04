-- logical_migration_id: 0027
-- contract_versions: github-installation-revocation.v1,
--                    synchronization-state.v1,
--                    daily-project-brief-energy-grant.v1,
--                    project-brief-generation-persistence.v2
-- purpose: serialize Installation-scoped write gates with trusted revocation

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
  where project_record.id=p_project_id
  for update of installation_record;
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
  where project_record.id = p_project_id
  for update of installation_record;

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
declare
  saved public.project_sync_dispatches%rowtype;
  installation_status text;
  installation_is_active boolean := false;
begin
  if p_expected_version < 1 or p_claimed_at is null then
    raise exception using errcode='P0001', message='sync_dispatch_invalid';
  end if;

  select installation_record.status into installation_status
  from public.projects project_record
  join public.selected_repositories selection_record
    on selection_record.id=project_record.selected_repository_id
  join public.github_installations installation_record
    on installation_record.id=selection_record.github_installation_id
  where project_record.id=p_project_id
  for update of installation_record;
  installation_is_active := found and installation_status='active';

  if installation_is_active then
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
    returning * into saved;
    if found then
      return jsonb_build_object('claimed',true,'version',saved.version);
    end if;
  end if;

  select * into saved from public.project_sync_dispatches dispatch
  where dispatch.project_id=p_project_id and dispatch.sync_run_id=p_sync_run_id;
  if not found then
    raise exception using errcode='P0002',message='sync_dispatch_not_found';
  end if;
  return jsonb_build_object('claimed',false,'version',saved.version);
end;
$$;

create or replace function public.reserve_project_brief_energy(
  p_project_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  authoritative_business_date date := (clock_timestamp() at time zone 'UTC')::date;
  normalized_request_key text := btrim(p_request_key);
  grant_record public.energy_ledger_entries%rowtype;
  reservation_result jsonb;
  installation_status text;
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'energy_unauthenticated';
  end if;
  if p_project_id is null
    or normalized_request_key is null
    or normalized_request_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$'
  then
    raise exception using errcode = 'P0001', message = 'energy_invalid_request';
  end if;

  select installation_record.status into installation_status
  from public.projects project_record
  join public.selected_repositories selection_record
    on selection_record.id=project_record.selected_repository_id
    and selection_record.user_id=project_record.user_id
  join public.github_installations installation_record
    on installation_record.id=selection_record.github_installation_id
    and installation_record.user_id=project_record.user_id
  where project_record.id=p_project_id
    and project_record.user_id=authenticated_user_id
  for update of installation_record;
  if not found then
    raise exception using errcode = 'P0001', message = 'energy_project_forbidden';
  end if;
  if installation_status<>'active' then
    raise exception using errcode='P0001', message='project_brief_authorization_failed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      authenticated_user_id::text || ':' || authoritative_business_date::text,
      29
    )
  );

  insert into public.energy_ledger_entries (
    user_id,business_date,idempotency_key,entry_type,amount,delta,metadata
  ) values (
    authenticated_user_id,authoritative_business_date,
    'daily-project-brief-grant.v1','grant',10,10,
    jsonb_build_object('contract_version', 'daily-project-brief-energy-grant.v1')
  ) on conflict (user_id, business_date, idempotency_key) do nothing;

  select ledger_record.* into grant_record
  from public.energy_ledger_entries ledger_record
  where ledger_record.user_id=authenticated_user_id
    and ledger_record.business_date=authoritative_business_date
    and ledger_record.idempotency_key='daily-project-brief-grant.v1';

  if not found
    or grant_record.entry_type<>'grant'
    or grant_record.amount<>10
    or grant_record.delta<>10
    or grant_record.project_id is not null
    or grant_record.reservation_id is not null
  then
    raise exception using errcode='P0001', message='energy_idempotency_conflict';
  end if;

  reservation_result := public.reserve_energy(
    p_project_id,authoritative_business_date,normalized_request_key,3
  );
  return reservation_result || jsonb_build_object(
    'business_date',authoritative_business_date
  );
exception
  when check_violation or not_null_violation then
    raise exception using errcode='P0001', message='energy_invalid_request';
end;
$$;

create or replace function public.finalize_project_brief_generation(
  p_actor_user_id uuid,
  p_reservation_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_prompt_version text,
  p_schema_version text,
  p_evidence_fingerprint text,
  p_payload jsonb,
  p_expires_at timestamptz,
  p_provider text,
  p_model text,
  p_request_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      p_prompt_version in ('project-brief-v1','project-brief-v2')
      and p_schema_version='project-brief-schema-v1'
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
$$;

create or replace function app_private.reject_inactive_project_energy_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare installation_status text;
begin
  select installation_record.status into installation_status
  from public.projects project_record
  join public.selected_repositories selection_record
    on selection_record.id=project_record.selected_repository_id
    and selection_record.user_id=project_record.user_id
  join public.github_installations installation_record
    on installation_record.id=selection_record.github_installation_id
    and installation_record.user_id=project_record.user_id
  where project_record.id=new.project_id
    and project_record.user_id=new.user_id
  for update of installation_record;
  if found then
    if installation_status<>'active' then
      raise exception using errcode='P0001', message='project_brief_authorization_failed';
    end if;
  elsif exists (
    select 1 from public.projects project_record where project_record.id=new.project_id
  ) then
    raise exception using errcode='P0001', message='project_brief_authorization_failed';
  end if;
  return new;
end;
$$;

create or replace function app_private.reject_inactive_project_ai_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare installation_status text;
begin
  if new.status<>'completed' then return new; end if;
  select installation_record.status into installation_status
  from public.projects project_record
  join public.selected_repositories selection_record
    on selection_record.id=project_record.selected_repository_id
    and selection_record.user_id=project_record.user_id
  join public.github_installations installation_record
    on installation_record.id=selection_record.github_installation_id
    and installation_record.user_id=project_record.user_id
  where project_record.id=new.project_id
    and project_record.user_id=new.user_id
  for update of installation_record;
  if found then
    if installation_status<>'active' then
      raise exception using errcode='P0001', message='project_brief_authorization_failed';
    end if;
  elsif exists (
    select 1 from public.projects project_record where project_record.id=new.project_id
  ) then
    raise exception using errcode='P0001', message='project_brief_authorization_failed';
  end if;
  return new;
end;
$$;

create or replace function app_private.reject_inactive_github_snapshot_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare installation_status text;
begin
  select installation_record.status into installation_status
  from public.projects project_record
  join public.selected_repositories selection_record
    on selection_record.id=project_record.selected_repository_id
    and selection_record.user_id=project_record.user_id
  join public.github_installations installation_record
    on installation_record.id=selection_record.github_installation_id
    and installation_record.user_id=project_record.user_id
  where project_record.id=new.project_id
  for update of installation_record;
  if found then
    if installation_status<>'active' then
      raise exception using errcode='P0001', message='github_activity_authorization_revoked';
    end if;
  elsif exists (
    select 1 from public.projects project_record where project_record.id=new.project_id
  ) then
    raise exception using errcode='P0001', message='github_activity_authorization_revoked';
  end if;
  return new;
end;
$$;

comment on function public.create_sync_run(uuid,text,text) is
  'Locks the internal Installation before creating a SyncRun so trusted revocation and new work have one serial order.';
comment on function public.request_project_sync(uuid,text,text,uuid,timestamptz) is
  'Locks the internal Installation before project Sync coalescing or creation; revoked and suspended states fail closed after lock waits.';
comment on function public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz) is
  'Locks the internal Installation before claiming dispatch work, preserving Installation-to-work lock order.';
comment on function public.reserve_project_brief_energy(uuid,text) is
  'Locks the internal Installation before daily grant and Brief reservation, preventing post-revoke Energy side effects.';
comment on function public.finalize_project_brief_generation(
  uuid,uuid,timestamptz,timestamptz,text,text,text,jsonb,
  timestamptz,text,text,text,integer,integer,integer
) is
  'Locks the internal Installation before reservation or completion rows, preventing post-revoke Brief and AI completion.';
