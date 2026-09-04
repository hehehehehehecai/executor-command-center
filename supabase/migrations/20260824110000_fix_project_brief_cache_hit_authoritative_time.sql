-- logical_migration_id: 0023
-- contract_versions: project-brief-generation-persistence.v1
-- purpose: separate cache observation time from the authoritative invocation record time
-- ordering: follows the existing 20260824100000 migration in the immutable ledger

create or replace function public.record_project_brief_cache_hit(
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
  v_recorded_at timestamptz;
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

  v_recorded_at := pg_catalog.clock_timestamp();

  insert into public.ai_invocations (
    user_id, project_id, feature, provider, model,
    prompt_version, schema_version, input_fingerprint,
    cache_equivalence_fingerprint, status, cache_status,
    brief_id, source_invocation_id, created_at, started_at, completed_at
  ) values (
    p_actor_user_id, brief_record.project_id, 'project_brief',
    source_record.provider, source_record.model,
    brief_record.prompt_version, brief_record.schema_version,
    p_current_evidence_fingerprint, p_cache_equivalence_fingerprint,
    'completed', 'hit', brief_record.id, source_record.id,
    v_recorded_at, v_recorded_at, v_recorded_at
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

alter function public.record_project_brief_cache_hit(uuid, uuid, text, text, timestamptz)
owner to postgres;

revoke all on function public.record_project_brief_cache_hit(uuid, uuid, text, text, timestamptz)
from public, anon, authenticated, service_role;

grant execute on function public.record_project_brief_cache_hit(uuid, uuid, text, text, timestamptz)
to service_role;
