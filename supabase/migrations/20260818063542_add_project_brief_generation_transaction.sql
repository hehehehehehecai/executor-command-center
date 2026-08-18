-- logical_migration_id: 0018
-- contract_versions: project-brief-generation-persistence.v1,
--                    project-brief-cache.v1
-- purpose: durably finalize or fail one reserved Project Brief generation

alter table public.energy_reservations
add column failure_stage text,
add column error_code text,
add constraint energy_reservations_failure_stage_check check (
  failure_stage is null or (
    failure_stage = btrim(failure_stage)
    and failure_stage ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    and char_length(failure_stage) <= 128
  )
),
add constraint energy_reservations_error_code_check check (
  error_code is null or (
    error_code = btrim(error_code)
    and error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    and char_length(error_code) <= 128
  )
),
add constraint energy_reservations_failure_pair_check check (
  (failure_stage is null) = (error_code is null)
  and (status = 'released' or failure_stage is null)
);

alter table public.ai_invocations
add column provider_request_id text,
add constraint ai_invocations_provider_request_id_check check (
  provider_request_id is null or (
    provider_request_id = btrim(provider_request_id)
    and provider_request_id <> ''
    and char_length(provider_request_id) <= 255
  )
);

drop index public.ai_invocations_reservation_idx;
create unique index ai_invocations_reservation_unique_idx
on public.ai_invocations (reservation_id)
where reservation_id is not null;

create index project_briefs_cache_lookup_idx
on public.project_briefs (
  user_id,
  project_id,
  range_start,
  range_end,
  prompt_version,
  schema_version,
  evidence_fingerprint,
  expires_at desc
)
where status = 'completed';

create or replace function app_private.enforce_energy_reservation_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.project_id is distinct from old.project_id
    or new.business_date is distinct from old.business_date
    or new.request_key is distinct from old.request_key
    or new.amount is distinct from old.amount
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = 'P0001', message = 'energy_reservation_identity_immutable';
  end if;
  if new.status <> old.status and not (
    old.status = 'reserved' and new.status in ('consumed', 'released')
  ) then
    raise exception using errcode = 'P0001', message = 'energy_invalid_state';
  end if;
  if new.status = old.status and (
    new.failure_stage is distinct from old.failure_stage
    or new.error_code is distinct from old.error_code
  ) then
    raise exception using errcode = 'P0001', message = 'energy_reservation_failure_immutable';
  end if;
  if new.status = 'consumed' and (
    new.failure_stage is not null or new.error_code is not null
  ) then
    raise exception using errcode = 'P0001', message = 'energy_invalid_state';
  end if;
  return new;
end;
$$;

create function public.finalize_project_brief_generation(
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
  completed_timestamp timestamptz := pg_catalog.clock_timestamp();
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_unauthenticated';
  end if;
  if p_reservation_id is null
    or p_range_start is null
    or p_range_end is null
    or p_range_end <= p_range_start
    or p_prompt_version is distinct from 'project-brief-v1'
    or p_schema_version is distinct from 'project-brief-schema-v1'
    or p_evidence_fingerprint is null
    or p_evidence_fingerprint !~ '^[0-9a-f]{64}$'
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or p_expires_at is null
    or p_expires_at <= completed_timestamp
    or (p_input_tokens is not null and p_input_tokens < 0)
    or (p_output_tokens is not null and p_output_tokens < 0)
    or (p_latency_ms is not null and p_latency_ms < 0)
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_invalid_request';
  end if;

  select candidate.* into reservation_record
  from public.energy_reservations candidate
  where candidate.id = p_reservation_id
    and candidate.user_id = authenticated_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_reservation_not_found';
  end if;
  if reservation_record.amount <> 3 then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
  end if;
  if p_payload ->> 'promptVersion' is distinct from p_prompt_version
    or p_payload ->> 'schemaVersion' is distinct from p_schema_version
    or p_payload ->> 'projectId' is distinct from reservation_record.project_id::text
    or p_payload ->> 'evidenceFingerprint' is distinct from p_evidence_fingerprint
    or (p_payload ->> 'rangeStart')::timestamptz is distinct from p_range_start
    or (p_payload ->> 'rangeEnd')::timestamptz is distinct from p_range_end
    or p_payload ->> 'boundaryNote' is distinct from
      'This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility.'
    or jsonb_typeof(p_payload -> 'evidenceRefs') is distinct from 'array'
    or jsonb_array_length(p_payload -> 'evidenceRefs') = 0
    or not p_payload ?& array[
      'officialStatus', 'summary', 'completedChanges', 'ongoingWork',
      'openItems', 'riskSignals', 'unknowns', 'freshness'
    ]
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_invalid_request';
  end if;

  if reservation_record.status = 'released' then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
  end if;

  if reservation_record.status = 'consumed' then
    select invocation_candidate.* into invocation_record
    from public.ai_invocations invocation_candidate
    where invocation_candidate.reservation_id = reservation_record.id
      and invocation_candidate.user_id = authenticated_user_id;
    if found then
      select brief_candidate.* into brief_record
      from public.project_briefs brief_candidate
      where brief_candidate.id = invocation_record.brief_id
        and brief_candidate.user_id = authenticated_user_id;
    end if;
    if not found
      or invocation_record.status <> 'completed'
      or brief_record.status <> 'completed'
      or brief_record.range_start <> p_range_start
      or brief_record.range_end <> p_range_end
      or brief_record.prompt_version <> p_prompt_version
      or brief_record.schema_version <> p_schema_version
      or brief_record.evidence_fingerprint <> p_evidence_fingerprint
      or brief_record.payload <> p_payload
    then
      raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'status', 'completed',
      'outcome', 'replayed',
      'reservation_id', reservation_record.id,
      'brief_id', brief_record.id,
      'invocation_id', invocation_record.id,
      'brief', brief_record.payload
    );
  end if;

  insert into public.project_briefs (
    user_id, project_id, range_start, range_end,
    prompt_version, schema_version, evidence_fingerprint,
    status, payload, completed_at, expires_at
  ) values (
    authenticated_user_id, reservation_record.project_id,
    p_range_start, p_range_end, p_prompt_version, p_schema_version,
    p_evidence_fingerprint, 'completed', p_payload,
    completed_timestamp, p_expires_at
  ) returning * into brief_record;

  insert into public.ai_invocations (
    user_id, project_id, feature, provider, model,
    prompt_version, schema_version, input_fingerprint,
    status, input_tokens, output_tokens, latency_ms, cache_status,
    provider_request_id,
    reservation_id, brief_id, started_at, completed_at
  ) values (
    authenticated_user_id, reservation_record.project_id, 'project_brief',
    p_provider, p_model, p_prompt_version, p_schema_version,
    p_evidence_fingerprint, 'completed', p_input_tokens, p_output_tokens,
    p_latency_ms, 'miss', p_request_id, reservation_record.id, brief_record.id,
    completed_timestamp, completed_timestamp
  ) returning * into invocation_record;

  update public.energy_reservations
  set status = 'consumed', consumed_at = completed_timestamp
  where id = reservation_record.id;

  insert into public.energy_ledger_entries (
    user_id, project_id, business_date, idempotency_key,
    entry_type, amount, delta, reservation_id, invocation_id,
    metadata
  ) values (
    reservation_record.user_id, reservation_record.project_id,
    reservation_record.business_date,
    'energy-reservation:' || reservation_record.id::text || ':consumed',
    'consumed', reservation_record.amount, 0, reservation_record.id,
    invocation_record.id,
    jsonb_build_object('feature', 'project_brief')
  );

  return jsonb_build_object(
    'status', 'completed',
    'outcome', 'completed',
    'reservation_id', reservation_record.id,
    'brief_id', brief_record.id,
    'invocation_id', invocation_record.id,
    'brief', brief_record.payload
  );
exception
  when check_violation or not_null_violation or foreign_key_violation
    or unique_violation or invalid_text_representation
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_persistence_failed';
end;
$$;

create function public.fail_project_brief_generation(
  p_actor_user_id uuid,
  p_reservation_id uuid,
  p_failure_stage text,
  p_error_code text,
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
    if reservation_record.failure_stage is distinct from p_failure_stage
      or reservation_record.error_code is distinct from p_error_code
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
    prompt_version, schema_version, status, provider_request_id,
    input_tokens, output_tokens, latency_ms, cache_status,
    failure_stage, error_code, reservation_id, started_at, completed_at
  ) values (
    authenticated_user_id, reservation_record.project_id, 'project_brief',
    p_provider, p_model, 'project-brief-v1', 'project-brief-schema-v1',
    'failed', p_request_id, p_input_tokens, p_output_tokens, p_latency_ms, 'miss',
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
$$;

create function public.get_project_brief_generation_outcome(
  p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  reservation_record public.energy_reservations%rowtype;
  brief_record public.project_briefs%rowtype;
  invocation_record public.ai_invocations%rowtype;
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_unauthenticated';
  end if;
  if p_reservation_id is null then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_invalid_request';
  end if;
  select candidate.* into reservation_record
  from public.energy_reservations candidate
  where candidate.id = p_reservation_id
    and candidate.user_id = authenticated_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_reservation_not_found';
  end if;
  if reservation_record.status = 'reserved' then
    return jsonb_build_object(
      'status', 'in_progress',
      'outcome', 'reserved',
      'reservation_id', reservation_record.id
    );
  end if;
  if reservation_record.status = 'released' then
    return jsonb_build_object(
      'status', 'failed',
      'outcome', 'released',
      'reservation_id', reservation_record.id,
      'failure_stage', coalesce(
        reservation_record.failure_stage, 'idempotency_conflict'
      ),
      'error_code', coalesce(
        reservation_record.error_code, 'project_brief_idempotency_conflict'
      )
    );
  end if;
  select invocation_candidate.* into invocation_record
  from public.ai_invocations invocation_candidate
  where invocation_candidate.reservation_id = reservation_record.id
    and invocation_candidate.user_id = authenticated_user_id;
  if found then
    select brief_candidate.* into brief_record
    from public.project_briefs brief_candidate
    where brief_candidate.id = invocation_record.brief_id
      and brief_candidate.user_id = authenticated_user_id;
  end if;
  if not found
    or invocation_record.status <> 'completed'
    or brief_record.status <> 'completed'
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_persistence_failed';
  end if;
  return jsonb_build_object(
    'status', 'completed',
    'outcome', 'replayed',
    'reservation_id', reservation_record.id,
    'brief_id', brief_record.id,
    'invocation_id', invocation_record.id,
    'brief', brief_record.payload
  );
end;
$$;

alter function app_private.enforce_energy_reservation_transition() owner to postgres;
alter function public.finalize_project_brief_generation(
  uuid, uuid, timestamptz, timestamptz, text, text, text, jsonb,
  timestamptz, text, text, text, integer, integer, integer
) owner to postgres;
alter function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, integer, integer, integer
) owner to postgres;
alter function public.get_project_brief_generation_outcome(uuid) owner to postgres;

revoke all on function app_private.enforce_energy_reservation_transition()
from public, anon, authenticated, service_role;
revoke all on function public.finalize_project_brief_generation(
  uuid, uuid, timestamptz, timestamptz, text, text, text, jsonb,
  timestamptz, text, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_project_brief_generation_outcome(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.finalize_project_brief_generation(
  uuid, uuid, timestamptz, timestamptz, text, text, text, jsonb,
  timestamptz, text, text, text, integer, integer, integer
) to service_role;
grant execute on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, integer, integer, integer
) to service_role;
grant execute on function public.get_project_brief_generation_outcome(uuid)
to authenticated;

comment on function public.finalize_project_brief_generation(
  uuid, uuid, timestamptz, timestamptz, text, text, text, jsonb,
  timestamptz, text, text, text, integer, integer, integer
) is 'Atomically persists one validated Project Brief and Invocation before consuming exactly three reserved energy points.';
