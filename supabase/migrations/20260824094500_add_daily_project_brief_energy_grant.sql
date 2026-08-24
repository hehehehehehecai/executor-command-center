-- logical_migration_id: 0021
-- contract_versions: daily-project-brief-energy-grant.v1
-- purpose: atomically grant the authenticated user's UTC daily entitlement and reserve a Brief's fixed cost

create function public.reserve_project_brief_energy(
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
  if not exists (
    select 1
    from public.projects project_record
    where project_record.id = p_project_id
      and project_record.user_id = authenticated_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'energy_project_forbidden';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      authenticated_user_id::text || ':' || authoritative_business_date::text,
      29
    )
  );

  insert into public.energy_ledger_entries (
    user_id,
    business_date,
    idempotency_key,
    entry_type,
    amount,
    delta,
    metadata
  ) values (
    authenticated_user_id,
    authoritative_business_date,
    'daily-project-brief-grant.v1',
    'grant',
    10,
    10,
    jsonb_build_object('contract_version', 'daily-project-brief-energy-grant.v1')
  )
  on conflict (user_id, business_date, idempotency_key) do nothing;

  select ledger_record.*
  into grant_record
  from public.energy_ledger_entries ledger_record
  where ledger_record.user_id = authenticated_user_id
    and ledger_record.business_date = authoritative_business_date
    and ledger_record.idempotency_key = 'daily-project-brief-grant.v1';

  if not found
    or grant_record.entry_type <> 'grant'
    or grant_record.amount <> 10
    or grant_record.delta <> 10
    or grant_record.project_id is not null
    or grant_record.reservation_id is not null
  then
    raise exception using errcode = 'P0001', message = 'energy_idempotency_conflict';
  end if;

  reservation_result := public.reserve_energy(
    p_project_id,
    authoritative_business_date,
    normalized_request_key,
    3
  );

  return reservation_result || jsonb_build_object(
    'business_date', authoritative_business_date
  );
exception
  when check_violation or not_null_violation then
    raise exception using errcode = 'P0001', message = 'energy_invalid_request';
end;
$$;

alter function public.reserve_project_brief_energy(uuid, text) owner to postgres;

revoke all on function public.reserve_project_brief_energy(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_project_brief_energy(uuid, text)
to authenticated;

-- The old generic RPC remains available to trusted database code and historical
-- contract tests, but clients can no longer choose a date or amount.
revoke all on function public.reserve_energy(uuid, date, text, integer)
from public, anon, authenticated, service_role;
