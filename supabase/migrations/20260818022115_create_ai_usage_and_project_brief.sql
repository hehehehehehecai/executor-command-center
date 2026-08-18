-- logical_migration_id: 0017
-- contract_versions: ai-usage.v1, energy-accounting.v1,
--                    project-brief-persistence.v1
-- purpose: persist project-owned AI invocation, energy and brief facts

alter table public.projects
add constraint projects_id_user_id_key unique (id, user_id);

create table public.project_briefs (
  id uuid constraint project_briefs_pkey primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null,
  range_start timestamptz not null,
  range_end timestamptz not null,
  prompt_version text,
  schema_version text,
  evidence_fingerprint text,
  status text not null default 'pending',
  payload jsonb,
  failure_stage text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  constraint project_briefs_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id) on delete cascade,
  constraint project_briefs_identity_key unique (id, user_id, project_id),
  constraint project_briefs_range_check check (range_end > range_start),
  constraint project_briefs_status_check
    check (status in ('pending', 'completed', 'failed')),
  constraint project_briefs_prompt_version_check check (
    prompt_version is null or (
      prompt_version = btrim(prompt_version)
      and prompt_version <> ''
      and char_length(prompt_version) <= 128
    )
  ),
  constraint project_briefs_schema_version_check check (
    schema_version is null or (
      schema_version = btrim(schema_version)
      and schema_version <> ''
      and char_length(schema_version) <= 128
    )
  ),
  constraint project_briefs_evidence_fingerprint_check check (
    evidence_fingerprint is null
    or evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint project_briefs_payload_check check (
    payload is null or jsonb_typeof(payload) = 'object'
  ),
  constraint project_briefs_failure_stage_check check (
    failure_stage is null or (
      failure_stage = btrim(failure_stage)
      and failure_stage ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
      and char_length(failure_stage) <= 128
    )
  ),
  constraint project_briefs_error_code_check check (
    error_code is null or (
      error_code = btrim(error_code)
      and error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
      and char_length(error_code) <= 128
    )
  ),
  constraint project_briefs_status_payload_check check (
    (
      status = 'pending'
      and completed_at is null
      and payload is null
      and failure_stage is null
      and error_code is null
    )
    or (
      status = 'completed'
      and completed_at is not null
      and prompt_version is not null
      and schema_version is not null
      and evidence_fingerprint is not null
      and payload is not null
      and failure_stage is null
      and error_code is null
    )
    or (
      status = 'failed'
      and completed_at is not null
      and payload is null
      and failure_stage is not null
      and error_code is not null
    )
  ),
  constraint project_briefs_timestamp_check check (
    (completed_at is null or completed_at >= created_at)
    and (expires_at is null or expires_at > created_at)
  )
);

create index project_briefs_project_created_idx
on public.project_briefs (project_id, created_at desc, id desc);

create table public.energy_reservations (
  id uuid constraint energy_reservations_pkey primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null,
  business_date date not null,
  request_key text not null,
  amount integer not null,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  constraint energy_reservations_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id) on delete cascade,
  constraint energy_reservations_identity_key unique (id, user_id, project_id),
  constraint energy_reservations_idempotency_key
    unique (user_id, business_date, request_key),
  constraint energy_reservations_request_key_check check (
    request_key = btrim(request_key)
    and request_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$'
  ),
  constraint energy_reservations_amount_check check (amount > 0),
  constraint energy_reservations_status_check
    check (status in ('reserved', 'consumed', 'released')),
  constraint energy_reservations_status_timestamps_check check (
    (
      status = 'reserved'
      and consumed_at is null
      and released_at is null
    )
    or (
      status = 'consumed'
      and consumed_at is not null
      and released_at is null
      and consumed_at >= created_at
    )
    or (
      status = 'released'
      and released_at is not null
      and consumed_at is null
      and released_at >= created_at
    )
  )
);

create index energy_reservations_user_day_status_idx
on public.energy_reservations (user_id, business_date, status, created_at, id);

create table public.ai_invocations (
  id uuid constraint ai_invocations_pkey primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null,
  feature text not null,
  provider text,
  model text,
  prompt_version text,
  schema_version text,
  input_fingerprint text,
  status text not null default 'pending',
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  cost_microunits bigint,
  cache_status text,
  failure_stage text,
  error_code text,
  reservation_id uuid,
  brief_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint ai_invocations_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id) on delete cascade,
  constraint ai_invocations_reservation_owner_fkey
    foreign key (reservation_id, user_id, project_id)
    references public.energy_reservations(id, user_id, project_id),
  constraint ai_invocations_brief_owner_fkey
    foreign key (brief_id, user_id, project_id)
    references public.project_briefs(id, user_id, project_id),
  constraint ai_invocations_feature_check check (
    feature = btrim(feature)
    and feature ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    and char_length(feature) <= 128
  ),
  constraint ai_invocations_optional_labels_check check (
    (provider is null or (provider = btrim(provider) and provider <> '' and char_length(provider) <= 128))
    and (model is null or (model = btrim(model) and model <> '' and char_length(model) <= 255))
    and (prompt_version is null or (prompt_version = btrim(prompt_version) and prompt_version <> '' and char_length(prompt_version) <= 128))
    and (schema_version is null or (schema_version = btrim(schema_version) and schema_version <> '' and char_length(schema_version) <= 128))
  ),
  constraint ai_invocations_input_fingerprint_check check (
    input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint ai_invocations_status_check
    check (status in ('pending', 'completed', 'failed')),
  constraint ai_invocations_usage_check check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (latency_ms is null or latency_ms >= 0)
    and (cost_microunits is null or cost_microunits >= 0)
  ),
  constraint ai_invocations_cache_status_check check (
    cache_status is null or cache_status in ('hit', 'miss', 'bypass')
  ),
  constraint ai_invocations_failure_check check (
    (failure_stage is null or (failure_stage = btrim(failure_stage) and failure_stage ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and char_length(failure_stage) <= 128))
    and (error_code is null or (error_code = btrim(error_code) and error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and char_length(error_code) <= 128))
  ),
  constraint ai_invocations_status_timestamps_check check (
    (
      status = 'pending'
      and completed_at is null
      and failure_stage is null
      and error_code is null
    )
    or (
      status = 'completed'
      and completed_at is not null
      and failure_stage is null
      and error_code is null
    )
    or (
      status = 'failed'
      and completed_at is not null
      and failure_stage is not null
      and error_code is not null
    )
  ),
  constraint ai_invocations_timestamp_check check (
    (started_at is null or started_at >= created_at)
    and (completed_at is null or completed_at >= created_at)
    and (completed_at is null or started_at is null or completed_at >= started_at)
  )
);

create index ai_invocations_project_created_idx
on public.ai_invocations (project_id, created_at desc, id desc);
create index ai_invocations_reservation_idx
on public.ai_invocations (reservation_id) where reservation_id is not null;
create index ai_invocations_brief_idx
on public.ai_invocations (brief_id) where brief_id is not null;

create table public.energy_ledger_entries (
  id uuid constraint energy_ledger_entries_pkey primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid,
  business_date date not null,
  idempotency_key text not null,
  entry_type text not null,
  amount integer not null,
  delta integer not null,
  reservation_id uuid references public.energy_reservations(id) on delete restrict,
  invocation_id uuid references public.ai_invocations(id) on delete restrict,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint energy_ledger_entries_project_owner_fkey
    foreign key (project_id, user_id)
    references public.projects(id, user_id) on delete restrict,
  constraint energy_ledger_entries_idempotency_key
    unique (user_id, business_date, idempotency_key),
  constraint energy_ledger_entries_reservation_event_key
    unique (reservation_id, entry_type),
  constraint energy_ledger_entries_idempotency_check check (
    idempotency_key = btrim(idempotency_key)
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$'
  ),
  constraint energy_ledger_entries_type_check
    check (entry_type in ('grant', 'reserved', 'consumed', 'released')),
  constraint energy_ledger_entries_amount_check check (amount > 0),
  constraint energy_ledger_entries_delta_check check (
    (entry_type = 'grant' and delta = amount)
    or (entry_type = 'reserved' and delta = -amount)
    or (entry_type = 'consumed' and delta = 0)
    or (entry_type = 'released' and delta = amount)
  ),
  constraint energy_ledger_entries_lineage_check check (
    (entry_type = 'grant' and reservation_id is null and project_id is null)
    or (entry_type in ('reserved', 'consumed', 'released') and reservation_id is not null and project_id is not null)
  ),
  constraint energy_ledger_entries_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index energy_ledger_entries_user_day_created_idx
on public.energy_ledger_entries (user_id, business_date, created_at, id);

comment on table public.ai_invocations is
  'Project-owned AI capability invocation facts only. Phase 1 performs no provider call.';
comment on table public.energy_ledger_entries is
  'Immutable daily energy accounting facts; available balance is sum(delta).';
comment on table public.energy_reservations is
  'Current-user project energy reservations with one-way idempotent terminal states.';
comment on table public.project_briefs is
  'Project-owned brief persistence envelope. Completed content requires explicit validation lineage.';

create function app_private.prevent_energy_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'energy_ledger_immutable';
end;
$$;

create trigger energy_ledger_entries_immutable
before update or delete on public.energy_ledger_entries
for each row execute function app_private.prevent_energy_ledger_mutation();

create function app_private.enforce_energy_reservation_transition()
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
  return new;
end;
$$;

create trigger energy_reservations_transition_guard
before update on public.energy_reservations
for each row execute function app_private.enforce_energy_reservation_transition();

create function app_private.enforce_ai_invocation_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.project_id is distinct from old.project_id
    or new.feature is distinct from old.feature
    or new.reservation_id is distinct from old.reservation_id
    or new.brief_id is distinct from old.brief_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = 'P0001', message = 'ai_invocation_identity_immutable';
  end if;
  if new.status <> old.status and not (
    old.status = 'pending' and new.status in ('completed', 'failed')
  ) then
    raise exception using errcode = 'P0001', message = 'ai_invocation_invalid_state';
  end if;
  return new;
end;
$$;

create trigger ai_invocations_transition_guard
before update on public.ai_invocations
for each row execute function app_private.enforce_ai_invocation_transition();

create function app_private.enforce_project_brief_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.project_id is distinct from old.project_id
    or new.range_start is distinct from old.range_start
    or new.range_end is distinct from old.range_end
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = 'P0001', message = 'project_brief_identity_immutable';
  end if;
  if new.status <> old.status and not (
    old.status = 'pending' and new.status in ('completed', 'failed')
  ) then
    raise exception using errcode = 'P0001', message = 'project_brief_invalid_state';
  end if;
  return new;
end;
$$;

create trigger project_briefs_transition_guard
before update on public.project_briefs
for each row execute function app_private.enforce_project_brief_transition();

alter table public.ai_invocations enable row level security;
alter table public.ai_invocations force row level security;
alter table public.energy_ledger_entries enable row level security;
alter table public.energy_ledger_entries force row level security;
alter table public.energy_reservations enable row level security;
alter table public.energy_reservations force row level security;
alter table public.project_briefs enable row level security;
alter table public.project_briefs force row level security;

revoke all on table public.ai_invocations from public, anon, authenticated, service_role;
revoke all on table public.energy_ledger_entries from public, anon, authenticated, service_role;
revoke all on table public.energy_reservations from public, anon, authenticated, service_role;
revoke all on table public.project_briefs from public, anon, authenticated, service_role;

create policy ai_invocations_select_own
on public.ai_invocations for select to authenticated
using (user_id = (select auth.uid()));
create policy energy_ledger_entries_select_own
on public.energy_ledger_entries for select to authenticated
using (user_id = (select auth.uid()));
create policy energy_reservations_select_own
on public.energy_reservations for select to authenticated
using (user_id = (select auth.uid()));
create policy project_briefs_select_own
on public.project_briefs for select to authenticated
using (user_id = (select auth.uid()));

grant select on table public.ai_invocations to authenticated;
grant select on table public.energy_ledger_entries to authenticated;
grant select on table public.energy_reservations to authenticated;
grant select on table public.project_briefs to authenticated;

create function app_private.available_energy(p_user_id uuid, p_business_date date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(entry_record.delta), 0)::bigint
  from public.energy_ledger_entries entry_record
  where entry_record.user_id = p_user_id
    and entry_record.business_date = p_business_date;
$$;

create function public.get_available_energy(p_business_date date)
returns bigint
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'energy_unauthenticated';
  end if;
  if p_business_date is null then
    raise exception using errcode = 'P0001', message = 'energy_invalid_request';
  end if;
  return app_private.available_energy(authenticated_user_id, p_business_date);
end;
$$;

create function public.reserve_energy(
  p_project_id uuid,
  p_business_date date,
  p_request_key text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  normalized_request_key text := btrim(p_request_key);
  existing_reservation public.energy_reservations%rowtype;
  saved_reservation public.energy_reservations%rowtype;
  available_before bigint;
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'energy_unauthenticated';
  end if;
  if p_project_id is null
    or p_business_date is null
    or normalized_request_key is null
    or normalized_request_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$'
    or p_amount is null
    or p_amount <= 0
  then
    raise exception using errcode = 'P0001', message = 'energy_invalid_request';
  end if;
  if not exists (
    select 1 from public.projects project_record
    where project_record.id = p_project_id
      and project_record.user_id = authenticated_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'energy_project_forbidden';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      authenticated_user_id::text || ':' || p_business_date::text,
      29
    )
  );

  select reservation_record.* into existing_reservation
  from public.energy_reservations reservation_record
  where reservation_record.user_id = authenticated_user_id
    and reservation_record.business_date = p_business_date
    and reservation_record.request_key = normalized_request_key
  for update;

  if found then
    if existing_reservation.project_id <> p_project_id
      or existing_reservation.amount <> p_amount
    then
      raise exception using errcode = 'P0001', message = 'energy_idempotency_conflict';
    end if;
    return jsonb_build_object(
      'reservation_id', existing_reservation.id,
      'status', existing_reservation.status,
      'outcome', 'replayed',
      'amount', existing_reservation.amount,
      'available_after', app_private.available_energy(authenticated_user_id, p_business_date)
    );
  end if;

  available_before := app_private.available_energy(authenticated_user_id, p_business_date);
  if available_before < p_amount then
    raise exception using errcode = 'P0001', message = 'energy_insufficient_balance';
  end if;

  insert into public.energy_reservations (
    user_id, project_id, business_date, request_key, amount
  ) values (
    authenticated_user_id, p_project_id, p_business_date,
    normalized_request_key, p_amount
  ) returning * into saved_reservation;

  insert into public.energy_ledger_entries (
    user_id, project_id, business_date, idempotency_key,
    entry_type, amount, delta, reservation_id
  ) values (
    authenticated_user_id, p_project_id, p_business_date,
    'energy-reservation:' || saved_reservation.id::text || ':reserved',
    'reserved', p_amount, -p_amount, saved_reservation.id
  );

  return jsonb_build_object(
    'reservation_id', saved_reservation.id,
    'status', saved_reservation.status,
    'outcome', 'reserved',
    'amount', saved_reservation.amount,
    'available_after', available_before - p_amount
  );
exception
  when check_violation or not_null_violation then
    raise exception using errcode = 'P0001', message = 'energy_invalid_request';
end;
$$;

create function public.consume_energy(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  reservation_record public.energy_reservations%rowtype;
  outcome_value text;
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'energy_unauthenticated';
  end if;
  if p_reservation_id is null then
    raise exception using errcode = 'P0001', message = 'energy_invalid_request';
  end if;
  select candidate.* into reservation_record
  from public.energy_reservations candidate
  where candidate.id = p_reservation_id
    and candidate.user_id = authenticated_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'energy_reservation_not_found';
  end if;
  if reservation_record.status = 'released' then
    raise exception using errcode = 'P0001', message = 'energy_invalid_state';
  end if;
  if reservation_record.status = 'consumed' then
    outcome_value := 'replayed';
  else
    update public.energy_reservations
    set status = 'consumed', consumed_at = now()
    where id = reservation_record.id
    returning * into reservation_record;
    insert into public.energy_ledger_entries (
      user_id, project_id, business_date, idempotency_key,
      entry_type, amount, delta, reservation_id
    ) values (
      reservation_record.user_id, reservation_record.project_id,
      reservation_record.business_date,
      'energy-reservation:' || reservation_record.id::text || ':consumed',
      'consumed', reservation_record.amount, 0, reservation_record.id
    );
    outcome_value := 'consumed';
  end if;
  return jsonb_build_object(
    'reservation_id', reservation_record.id,
    'status', reservation_record.status,
    'outcome', outcome_value,
    'amount', reservation_record.amount,
    'available_after', app_private.available_energy(
      authenticated_user_id, reservation_record.business_date
    )
  );
end;
$$;

create function public.release_energy(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authenticated_user_id uuid := auth.uid();
  reservation_record public.energy_reservations%rowtype;
  outcome_value text;
begin
  if authenticated_user_id is null then
    raise exception using errcode = 'P0001', message = 'energy_unauthenticated';
  end if;
  if p_reservation_id is null then
    raise exception using errcode = 'P0001', message = 'energy_invalid_request';
  end if;
  select candidate.* into reservation_record
  from public.energy_reservations candidate
  where candidate.id = p_reservation_id
    and candidate.user_id = authenticated_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'energy_reservation_not_found';
  end if;
  if reservation_record.status = 'consumed' then
    raise exception using errcode = 'P0001', message = 'energy_invalid_state';
  end if;
  if reservation_record.status = 'released' then
    outcome_value := 'replayed';
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        authenticated_user_id::text || ':' || reservation_record.business_date::text,
        29
      )
    );
    update public.energy_reservations
    set status = 'released', released_at = now()
    where id = reservation_record.id
    returning * into reservation_record;
    insert into public.energy_ledger_entries (
      user_id, project_id, business_date, idempotency_key,
      entry_type, amount, delta, reservation_id
    ) values (
      reservation_record.user_id, reservation_record.project_id,
      reservation_record.business_date,
      'energy-reservation:' || reservation_record.id::text || ':released',
      'released', reservation_record.amount, reservation_record.amount,
      reservation_record.id
    );
    outcome_value := 'released';
  end if;
  return jsonb_build_object(
    'reservation_id', reservation_record.id,
    'status', reservation_record.status,
    'outcome', outcome_value,
    'amount', reservation_record.amount,
    'available_after', app_private.available_energy(
      authenticated_user_id, reservation_record.business_date
    )
  );
end;
$$;

alter function app_private.prevent_energy_ledger_mutation() owner to postgres;
alter function app_private.enforce_energy_reservation_transition() owner to postgres;
alter function app_private.enforce_ai_invocation_transition() owner to postgres;
alter function app_private.enforce_project_brief_transition() owner to postgres;
alter function app_private.available_energy(uuid, date) owner to postgres;
alter function public.get_available_energy(date) owner to postgres;
alter function public.reserve_energy(uuid, date, text, integer) owner to postgres;
alter function public.consume_energy(uuid) owner to postgres;
alter function public.release_energy(uuid) owner to postgres;

revoke all on function app_private.prevent_energy_ledger_mutation()
from public, anon, authenticated, service_role;
revoke all on function app_private.enforce_energy_reservation_transition()
from public, anon, authenticated, service_role;
revoke all on function app_private.enforce_ai_invocation_transition()
from public, anon, authenticated, service_role;
revoke all on function app_private.enforce_project_brief_transition()
from public, anon, authenticated, service_role;
revoke all on function app_private.available_energy(uuid, date)
from public, anon, authenticated, service_role;

revoke all on function public.get_available_energy(date)
from public, anon, authenticated, service_role;
revoke all on function public.reserve_energy(uuid, date, text, integer)
from public, anon, authenticated, service_role;
revoke all on function public.consume_energy(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.release_energy(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.get_available_energy(date) to authenticated;
grant execute on function public.reserve_energy(uuid, date, text, integer) to authenticated;
grant execute on function public.consume_energy(uuid) to authenticated;
grant execute on function public.release_energy(uuid) to authenticated;
