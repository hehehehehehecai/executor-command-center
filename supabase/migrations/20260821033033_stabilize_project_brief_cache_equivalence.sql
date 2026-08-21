-- logical_migration_id: 0020
-- contract_versions: project-brief-evidence-cache-equivalence.v1
-- purpose: persist stable cache equivalence without weakening the full Evidence fingerprint

alter table public.project_briefs
add column cache_equivalence_fingerprint text,
add column payload_fingerprint text,
add constraint project_briefs_cache_equivalence_fingerprint_check check (
  cache_equivalence_fingerprint is null
  or cache_equivalence_fingerprint ~ '^[0-9a-f]{64}$'
),
add constraint project_briefs_payload_fingerprint_check check (
  payload_fingerprint is null or payload_fingerprint ~ '^[0-9a-f]{64}$'
);

alter table public.ai_invocations
add column cache_equivalence_fingerprint text,
add column source_invocation_id uuid,
add constraint ai_invocations_cache_equivalence_fingerprint_check check (
  cache_equivalence_fingerprint is null
  or cache_equivalence_fingerprint ~ '^[0-9a-f]{64}$'
),
add constraint ai_invocations_identity_key unique (id, user_id, project_id),
add constraint ai_invocations_source_owner_fkey
  foreign key (source_invocation_id, user_id, project_id)
  references public.ai_invocations(id, user_id, project_id);

create index project_briefs_cache_equivalence_lookup_idx
on public.project_briefs (
  user_id, project_id, range_start, range_end,
  prompt_version, schema_version, cache_equivalence_fingerprint,
  expires_at desc
)
where status = 'completed' and cache_equivalence_fingerprint is not null;

create function public.finalize_project_brief_generation(
  p_actor_user_id uuid,
  p_reservation_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_prompt_version text,
  p_schema_version text,
  p_evidence_fingerprint text,
  p_cache_equivalence_fingerprint text,
  p_payload_fingerprint text,
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
  outcome jsonb;
begin
  if p_cache_equivalence_fingerprint is null
    or p_cache_equivalence_fingerprint !~ '^[0-9a-f]{64}$'
    or p_payload_fingerprint is null
    or p_payload_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_invalid_request';
  end if;

  outcome := public.finalize_project_brief_generation(
    p_actor_user_id, p_reservation_id, p_range_start, p_range_end,
    p_prompt_version, p_schema_version, p_evidence_fingerprint, p_payload,
    p_expires_at, p_provider, p_model, p_request_id,
    p_input_tokens, p_output_tokens, p_latency_ms
  );

  update public.project_briefs
  set cache_equivalence_fingerprint = p_cache_equivalence_fingerprint,
      payload_fingerprint = p_payload_fingerprint
  where id = (outcome ->> 'brief_id')::uuid
    and user_id = p_actor_user_id
    and (
      cache_equivalence_fingerprint is null
      or cache_equivalence_fingerprint = p_cache_equivalence_fingerprint
    );
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
  end if;

  update public.ai_invocations
  set cache_equivalence_fingerprint = p_cache_equivalence_fingerprint
  where id = (outcome ->> 'invocation_id')::uuid
    and user_id = p_actor_user_id
    and (
      cache_equivalence_fingerprint is null
      or cache_equivalence_fingerprint = p_cache_equivalence_fingerprint
    );
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
  end if;

  return outcome;
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
  p_input_fingerprint text,
  p_cache_equivalence_fingerprint text,
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
  outcome jsonb;
begin
  if p_cache_equivalence_fingerprint is null
    or p_cache_equivalence_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_invalid_request';
  end if;

  outcome := public.fail_project_brief_generation(
    p_actor_user_id, p_reservation_id, p_failure_stage, p_error_code,
    p_provider, p_model, p_request_id, p_input_fingerprint,
    p_input_tokens, p_output_tokens, p_latency_ms
  );

  update public.ai_invocations
  set cache_equivalence_fingerprint = p_cache_equivalence_fingerprint
  where reservation_id = p_reservation_id
    and user_id = p_actor_user_id
    and (
      cache_equivalence_fingerprint is null
      or cache_equivalence_fingerprint = p_cache_equivalence_fingerprint
    );
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
  end if;

  return outcome;
end;
$$;

create function public.record_project_brief_cache_hit(
  p_actor_user_id uuid,
  p_brief_id uuid,
  p_current_evidence_fingerprint text,
  p_cache_equivalence_fingerprint text,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  brief_record public.project_briefs%rowtype;
  source_record public.ai_invocations%rowtype;
  invocation_record public.ai_invocations%rowtype;
begin
  if p_actor_user_id is null or p_brief_id is null or p_observed_at is null
    or p_current_evidence_fingerprint is null
    or p_current_evidence_fingerprint !~ '^[0-9a-f]{64}$'
    or p_cache_equivalence_fingerprint is null
    or p_cache_equivalence_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_invalid_request';
  end if;

  select candidate.* into brief_record
  from public.project_briefs candidate
  where candidate.id = p_brief_id
    and candidate.user_id = p_actor_user_id
    and candidate.status = 'completed'
    and candidate.cache_equivalence_fingerprint = p_cache_equivalence_fingerprint
    and candidate.payload_fingerprint is not null
    and candidate.expires_at > p_observed_at;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_idempotency_conflict';
  end if;

  select candidate.* into source_record
  from public.ai_invocations candidate
  where candidate.brief_id = brief_record.id
    and candidate.user_id = p_actor_user_id
    and candidate.status = 'completed'
    and candidate.cache_status = 'miss'
    and candidate.cache_equivalence_fingerprint = p_cache_equivalence_fingerprint
  order by candidate.created_at, candidate.id
  limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_persistence_failed';
  end if;

  insert into public.ai_invocations (
    user_id, project_id, feature, provider, model,
    prompt_version, schema_version, input_fingerprint,
    cache_equivalence_fingerprint, status, cache_status,
    brief_id, source_invocation_id, started_at, completed_at
  ) values (
    p_actor_user_id, brief_record.project_id, 'project_brief',
    source_record.provider, source_record.model,
    brief_record.prompt_version, brief_record.schema_version,
    p_current_evidence_fingerprint, p_cache_equivalence_fingerprint,
    'completed', 'hit', brief_record.id, source_record.id,
    p_observed_at, p_observed_at
  ) returning * into invocation_record;

  return jsonb_build_object(
    'status', 'completed',
    'outcome', 'cache_hit',
    'brief_id', brief_record.id,
    'invocation_id', invocation_record.id,
    'source_invocation_id', source_record.id
  );
exception
  when check_violation or not_null_violation or foreign_key_violation
    or unique_violation
  then
    raise exception using errcode = 'P0001', message = 'project_brief_generation_persistence_failed';
end;
$$;

alter function public.finalize_project_brief_generation(
  uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb,
  timestamptz, text, text, text, integer, integer, integer
) owner to postgres;
alter function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer
) owner to postgres;
alter function public.record_project_brief_cache_hit(uuid, uuid, text, text, timestamptz)
owner to postgres;

revoke all on function public.finalize_project_brief_generation(
  uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb,
  timestamptz, text, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.record_project_brief_cache_hit(uuid, uuid, text, text, timestamptz)
from public, anon, authenticated, service_role;

grant execute on function public.finalize_project_brief_generation(
  uuid, uuid, timestamptz, timestamptz, text, text, text, text, text, jsonb,
  timestamptz, text, text, text, integer, integer, integer
) to service_role;
grant execute on function public.fail_project_brief_generation(
  uuid, uuid, text, text, text, text, text, text, text, integer, integer, integer
) to service_role;
grant execute on function public.record_project_brief_cache_hit(uuid, uuid, text, text, timestamptz)
to service_role;
