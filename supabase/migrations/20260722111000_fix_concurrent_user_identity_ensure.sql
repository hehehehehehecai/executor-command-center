-- logical_migration_id: 0003
-- contract_version: internal-user-identity.v1
-- finding_id: F-01
-- purpose: serialize identity establishment for the same Supabase Auth user

create or replace function public.ensure_user_identity(
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

  perform 1
  from auth.users auth_user
  where auth_user.id = p_auth_user_id
  for update;

  if not found then
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

alter function public.ensure_user_identity(uuid, bigint, varchar, text)
owner to postgres;

comment on function public.ensure_user_identity(uuid, bigint, varchar, text) is
  'Atomically creates or refreshes one internal user and one stable GitHub identity binding, serialized by Auth user.';

revoke all on function public.ensure_user_identity(uuid, bigint, varchar, text)
from public, anon, authenticated;
grant execute on function public.ensure_user_identity(uuid, bigint, varchar, text)
to service_role;
