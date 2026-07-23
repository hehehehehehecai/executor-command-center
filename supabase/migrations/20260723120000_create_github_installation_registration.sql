-- logical_migration_id: 0004
-- contract_versions: github-installation-registration.v1,
--                    github-installation-state.v1,
--                    github-installation-storage.v1
-- purpose: atomically register verified personal GitHub App installations

create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  installation_id bigint not null,
  github_account_id bigint not null,
  github_account_login varchar(255) not null,
  account_type varchar(32) not null,
  repository_selection varchar(16) not null,
  status varchar(16) not null,
  suspended_at timestamptz,
  revoked_at timestamptz,
  last_verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_installations_installation_id_key unique (installation_id),
  constraint github_installations_user_account_key
    unique (user_id, github_account_id),
  constraint github_installations_installation_id_check
    check (installation_id > 0),
  constraint github_installations_github_account_id_check
    check (github_account_id > 0),
  constraint github_installations_github_account_login_check
    check (
      github_account_login = btrim(github_account_login)
      and github_account_login <> ''
    ),
  constraint github_installations_account_type_check
    check (account_type = 'User'),
  constraint github_installations_repository_selection_check
    check (repository_selection in ('all', 'selected')),
  constraint github_installations_status_timestamps_check
    check (
      (
        status = 'active'
        and suspended_at is null
        and revoked_at is null
      )
      or (
        status = 'suspended'
        and suspended_at is not null
        and revoked_at is null
      )
      or (
        status = 'revoked'
        and revoked_at is not null
      )
    )
);

comment on table public.github_installations is
  'Verified personal GitHub App installations. Repository data and access tokens are intentionally excluded.';

create table public.github_installation_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  state_hash text not null,
  return_to text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint github_installation_states_state_hash_key unique (state_hash),
  constraint github_installation_states_state_hash_check
    check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint github_installation_states_return_to_check
    check (
      return_to like '/%'
      and return_to not like '//%'
      and return_to !~ E'[\\\\\\x00-\\x1f\\x7f]'
    )
);

comment on table public.github_installation_states is
  'Short-lived, user-bound, single-use SHA-256 hashes for GitHub App setup callbacks. Raw state is never stored.';

create index github_installation_states_expires_at_idx
on public.github_installation_states (expires_at);

create trigger github_installations_set_updated_at
before update on public.github_installations
for each row execute function app_private.set_updated_at();

alter table public.github_installations enable row level security;
alter table public.github_installation_states enable row level security;

revoke all on table public.github_installations from anon, authenticated;
revoke all on table public.github_installation_states from anon, authenticated;

create policy github_installations_select_own
on public.github_installations
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on table public.github_installations to authenticated;

create function public.create_github_installation_state(
  p_user_id uuid,
  p_state_hash text,
  p_return_to text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_state_id uuid;
begin
  if not exists (
    select 1
    from public.users user_record
    where user_record.id = p_user_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'internal_user_not_found';
  end if;

  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid_installation_state_hash';
  end if;

  if p_return_to is null
    or p_return_to not like '/%'
    or p_return_to like '//%'
    or p_return_to ~ E'[\\\\\\x00-\\x1f\\x7f]'
  then
    raise exception using
      errcode = '22023',
      message = 'unsafe_installation_return_to';
  end if;

  if p_expires_at <= now()
    or p_expires_at > now() + interval '10 minutes'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_installation_state_expiry';
  end if;

  delete from public.github_installation_states state_record
  where state_record.expires_at <= now();

  insert into public.github_installation_states (
    user_id,
    state_hash,
    return_to,
    expires_at
  )
  values (
    p_user_id,
    p_state_hash,
    p_return_to,
    p_expires_at
  )
  returning id into created_state_id;

  return created_state_id;
end;
$$;

create function public.consume_github_installation_state(
  p_user_id uuid,
  p_state_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_record public.github_installation_states%rowtype;
begin
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'installation_state_invalid';
  end if;

  select candidate.*
  into state_record
  from public.github_installation_states candidate
  where candidate.state_hash = p_state_hash
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'installation_state_invalid';
  end if;

  if state_record.user_id is distinct from p_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'installation_state_wrong_user';
  end if;

  if state_record.consumed_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'installation_state_replayed';
  end if;

  if state_record.expires_at <= now() then
    raise exception using
      errcode = 'P0001',
      message = 'installation_state_expired';
  end if;

  update public.github_installation_states candidate
  set consumed_at = now()
  where candidate.id = state_record.id;

  delete from public.github_installation_states expired_state_record
  where expired_state_record.expires_at <= now()
    and expired_state_record.state_hash <> p_state_hash;

  return state_record.return_to;
end;
$$;

create function public.register_verified_github_installation(
  p_user_id uuid,
  p_installation_id bigint,
  p_github_account_id bigint,
  p_github_account_login varchar(255),
  p_account_type varchar(32),
  p_repository_selection varchar(16),
  p_status varchar(16),
  p_suspended_at timestamptz,
  p_verified_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_login varchar(255) := btrim(p_github_account_login);
  current_github_user_id bigint;
  existing_record public.github_installations%rowtype;
  installation_record_id uuid;
begin
  if p_installation_id is null or p_installation_id <= 0
    or p_github_account_id is null or p_github_account_id <= 0
    or normalized_login is null or normalized_login = ''
    or p_account_type <> 'User'
    or p_repository_selection not in ('all', 'selected')
    or p_status not in ('active', 'suspended')
    or p_verified_at is null
    or (p_status = 'active' and p_suspended_at is not null)
    or (p_status = 'suspended' and p_suspended_at is null)
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_github_installation_input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_installation_id);

  perform 1
  from public.users user_record
  where user_record.id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'internal_user_not_found';
  end if;

  select identity.github_user_id
  into current_github_user_id
  from public.github_identities identity
  where identity.user_id = p_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'current_github_identity_missing';
  end if;

  if current_github_user_id <> p_github_account_id then
    raise exception using
      errcode = 'P0001',
      message = 'installation_account_mismatch';
  end if;

  select installation.*
  into existing_record
  from public.github_installations installation
  where installation.installation_id = p_installation_id
  for update;

  if found and (
    existing_record.user_id <> p_user_id
    or existing_record.github_account_id <> p_github_account_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'github_installation_already_bound';
  end if;

  select installation.*
  into existing_record
  from public.github_installations installation
  where installation.user_id = p_user_id
    and installation.github_account_id = p_github_account_id
  for update;

  if found then
    update public.github_installations
    set
      installation_id = p_installation_id,
      github_account_login = normalized_login,
      account_type = p_account_type,
      repository_selection = p_repository_selection,
      status = p_status,
      suspended_at = p_suspended_at,
      revoked_at = null,
      last_verified_at = p_verified_at
    where id = existing_record.id
    returning id into installation_record_id;

    return installation_record_id;
  end if;

  begin
    insert into public.github_installations (
      user_id,
      installation_id,
      github_account_id,
      github_account_login,
      account_type,
      repository_selection,
      status,
      suspended_at,
      revoked_at,
      last_verified_at
    )
    values (
      p_user_id,
      p_installation_id,
      p_github_account_id,
      normalized_login,
      p_account_type,
      p_repository_selection,
      p_status,
      p_suspended_at,
      null,
      p_verified_at
    )
    returning id into installation_record_id;
  exception
    when unique_violation then
      if exists (
        select 1
        from public.github_installations installation
        where installation.installation_id = p_installation_id
          and installation.user_id <> p_user_id
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'github_installation_already_bound';
      end if;

      raise;
  end;

  return installation_record_id;
end;
$$;

comment on function public.create_github_installation_state(
  uuid,
  text,
  text,
  timestamptz
) is
  'Creates a ten-minute, hash-only GitHub installation state for a verified internal user.';
comment on function public.consume_github_installation_state(uuid, text) is
  'Atomically consumes one non-expired GitHub installation state bound to an internal user.';
comment on function public.register_verified_github_installation(
  uuid,
  bigint,
  bigint,
  varchar,
  varchar,
  varchar,
  varchar,
  timestamptz,
  timestamptz
) is
  'Atomically and idempotently registers a verified personal GitHub App installation.';

revoke all on function public.create_github_installation_state(
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.consume_github_installation_state(uuid, text)
from public, anon, authenticated;
revoke all on function public.register_verified_github_installation(
  uuid,
  bigint,
  bigint,
  varchar,
  varchar,
  varchar,
  varchar,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.create_github_installation_state(
  uuid,
  text,
  text,
  timestamptz
) to service_role;
grant execute on function public.consume_github_installation_state(uuid, text)
to service_role;
grant execute on function public.register_verified_github_installation(
  uuid,
  bigint,
  bigint,
  varchar,
  varchar,
  varchar,
  varchar,
  timestamptz,
  timestamptz
) to service_role;
