create function public.fail_project_brief_generation(
  p_actor_user_id uuid,
  p_reservation_id uuid,
  p_failure_stage text,
  p_error_code text,
  p_provider text,
  p_model text,
  p_request_id text,
  p_input_fingerprint text,
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
    or p_input_fingerprint is null
    or p_input_fingerprint !~ '^[0-9a-f]{64}$'
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
    prompt_version, schema_version, input_fingerprint, status, provider_request_id,
    input_tokens, output_tokens, latency_ms, cache_status,
    failure_stage, error_code, reservation_id, started_at, completed_at
  ) values (
    authenticated_user_id, reservation_record.project_id, 'project_brief',
    p_provider, p_model, 'project-brief-v1', 'project-brief-schema-v1',
    p_input_fingerprint, 'failed', p_request_id,
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
$$;

revoke all on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;

alter function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, text, integer, integer, integer
) owner to postgres;

revoke all on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, text, integer, integer, integer
) to service_role;

comment on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, text, integer, integer, integer
) is 'Atomically records a failed project brief invocation with its Evidence fingerprint and releases the reservation.';
