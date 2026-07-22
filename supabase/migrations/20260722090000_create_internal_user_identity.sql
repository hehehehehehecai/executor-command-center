-- logical_migration_id: 0002
-- contract_version: internal-user-identity.v1
-- purpose: bind Supabase Auth users to stable GitHub user identities

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is
  'Internal business users. The primary key is the corresponding Supabase Auth user UUID.';

create table public.github_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  github_user_id bigint not null,
  github_login varchar(255) not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_identities_user_id_key unique (user_id),
  constraint github_identities_github_user_id_key unique (github_user_id),
  constraint github_identities_github_user_id_check check (github_user_id > 0),
  constraint github_identities_github_login_check check (
    github_login = btrim(github_login)
    and github_login <> ''
  ),
  constraint github_identities_avatar_url_check check (
    avatar_url is null
    or (
      char_length(avatar_url) <= 2048
      and avatar_url ~ '^https?://[^[:space:]]+$'
    )
  )
);

comment on table public.github_identities is
  'Stable GitHub numeric identities bound one-to-one to internal users. Login and avatar are mutable display data.';

create function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function app_private.set_updated_at() from public, anon, authenticated;

create trigger users_set_updated_at
before update on public.users
for each row execute function app_private.set_updated_at();

create trigger github_identities_set_updated_at
before update on public.github_identities
for each row execute function app_private.set_updated_at();

alter table public.users enable row level security;
alter table public.github_identities enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.github_identities from anon, authenticated;

create policy users_select_own
on public.users
for select
to authenticated
using (id = (select auth.uid()));

create policy github_identities_select_own
on public.github_identities
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on table public.users to authenticated;
grant select on table public.github_identities to authenticated;

create function public.ensure_user_identity(
  p_auth_user_id uuid,
  p_github_user_id bigint,
  p_github_login varchar(255),
  p_avatar_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_github_user_id bigint;
  existing_user_id uuid;
  normalized_github_login varchar(255) := btrim(p_github_login);
begin
  if p_github_user_id <= 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_github_user_id';
  end if;

  if normalized_github_login is null or normalized_github_login = '' then
    raise exception using
      errcode = '22023',
      message = 'invalid_github_login';
  end if;

  if p_avatar_url is not null and (
    char_length(p_avatar_url) > 2048
    or p_avatar_url !~ '^https?://[^[:space:]]+$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_avatar_url';
  end if;

  if not exists (
    select 1
    from auth.users auth_user
    where auth_user.id = p_auth_user_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'auth_user_not_found';
  end if;

  select identity.github_user_id
  into existing_github_user_id
  from public.github_identities identity
  where identity.user_id = p_auth_user_id
  for update;

  if found then
    if existing_github_user_id <> p_github_user_id then
      raise exception using
        errcode = 'P0001',
        message = 'identity_auth_user_conflict';
    end if;

    update public.github_identities
    set
      github_login = normalized_github_login,
      avatar_url = p_avatar_url
    where user_id = p_auth_user_id;

    return p_auth_user_id;
  end if;

  select identity.user_id
  into existing_user_id
  from public.github_identities identity
  where identity.github_user_id = p_github_user_id
  for update;

  if found then
    raise exception using
      errcode = 'P0001',
      message = 'identity_github_user_conflict';
  end if;

  insert into public.users (id)
  values (p_auth_user_id)
  on conflict (id) do nothing;

  begin
    insert into public.github_identities (
      user_id,
      github_user_id,
      github_login,
      avatar_url
    )
    values (
      p_auth_user_id,
      p_github_user_id,
      normalized_github_login,
      p_avatar_url
    );
  exception
    when unique_violation then
      if exists (
        select 1
        from public.github_identities identity
        where identity.github_user_id = p_github_user_id
          and identity.user_id <> p_auth_user_id
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'identity_github_user_conflict';
      end if;

      raise exception using
        errcode = 'P0001',
        message = 'identity_auth_user_conflict';
  end;

  return p_auth_user_id;
end;
$$;

comment on function public.ensure_user_identity(uuid, bigint, varchar, text) is
  'Atomically creates or refreshes one internal user and one stable GitHub identity binding.';

revoke all on function public.ensure_user_identity(uuid, bigint, varchar, text)
from public, anon, authenticated;
grant execute on function public.ensure_user_identity(uuid, bigint, varchar, text)
to service_role;
