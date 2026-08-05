-- logical_migration_id: 0005
-- contract_versions: selected-github-repository.v1,
--                    github-repository-selection-storage.v1
-- purpose: atomically persist current-user GitHub repository selections

create table public.selected_repositories (
  id uuid
    constraint selected_repositories_pkey
    primary key
    default gen_random_uuid(),
  user_id uuid not null,
  github_installation_id uuid not null,
  github_repository_id bigint not null,
  owner_login varchar(255) not null,
  name varchar(255) not null,
  full_name varchar(512) not null,
  visibility text not null,
  is_private boolean not null,
  is_fork boolean not null,
  is_archived boolean not null,
  is_disabled boolean not null,
  default_branch varchar(255) not null,
  selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint selected_repositories_user_id_fkey
    foreign key (user_id)
    references public.users(id)
    on delete cascade,
  constraint selected_repositories_github_installation_id_fkey
    foreign key (github_installation_id)
    references public.github_installations(id)
    on delete restrict,
  constraint selected_repositories_user_repository_key
    unique (user_id, github_repository_id),
  constraint selected_repositories_installation_repository_key
    unique (github_installation_id, github_repository_id),
  constraint selected_repositories_repository_id_check
    check (github_repository_id > 0),
  constraint selected_repositories_owner_login_check
    check (
      owner_login = btrim(owner_login)
      and owner_login <> ''
    ),
  constraint selected_repositories_name_check
    check (
      name = btrim(name)
      and name <> ''
    ),
  constraint selected_repositories_full_name_check
    check (
      full_name = btrim(full_name)
      and full_name <> ''
    ),
  constraint selected_repositories_visibility_check
    check (visibility in ('public', 'private', 'internal')),
  constraint selected_repositories_default_branch_check
    check (
      default_branch = btrim(default_branch)
      and default_branch <> ''
    )
);

comment on table public.selected_repositories is
  'Current-user GitHub repository selections. Tokens, raw GitHub payloads, repository contents, and project state are intentionally excluded.';

create index selected_repositories_user_sort_idx
on public.selected_repositories (
  user_id,
  lower(full_name),
  github_repository_id
);

create trigger selected_repositories_set_updated_at
before update on public.selected_repositories
for each row execute function app_private.set_updated_at();

alter table public.selected_repositories enable row level security;

revoke all on table public.selected_repositories
from public, anon, authenticated, service_role;

create policy selected_repositories_select_own
on public.selected_repositories
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on table public.selected_repositories to authenticated;

create function public.ensure_selected_github_repository(
  p_user_id uuid,
  p_github_installation_id uuid,
  p_github_repository_id bigint,
  p_owner_login varchar(255),
  p_name varchar(255),
  p_full_name varchar(512),
  p_visibility text,
  p_is_private boolean,
  p_is_fork boolean,
  p_is_archived boolean,
  p_is_disabled boolean,
  p_default_branch varchar(255)
)
returns public.selected_repositories
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation_user_id uuid;
  installation_status varchar(16);
  selected_repository public.selected_repositories%rowtype;
begin
  select
    installation_record.user_id,
    installation_record.status
  into
    installation_user_id,
    installation_status
  from public.github_installations installation_record
  where installation_record.id = p_github_installation_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'github_repository_selection_installation_not_found';
  end if;

  if installation_user_id is distinct from p_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'github_repository_selection_installation_wrong_user';
  end if;

  if installation_status is distinct from 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'github_repository_selection_installation_not_active';
  end if;

  begin
    insert into public.selected_repositories (
      user_id,
      github_installation_id,
      github_repository_id,
      owner_login,
      name,
      full_name,
      visibility,
      is_private,
      is_fork,
      is_archived,
      is_disabled,
      default_branch,
      selected_at,
      created_at,
      updated_at
    )
    values (
      p_user_id,
      p_github_installation_id,
      p_github_repository_id,
      p_owner_login,
      p_name,
      p_full_name,
      p_visibility,
      p_is_private,
      p_is_fork,
      p_is_archived,
      p_is_disabled,
      p_default_branch,
      now(),
      now(),
      now()
    )
    on conflict on constraint selected_repositories_user_repository_key
    do update
    set
      owner_login = excluded.owner_login,
      name = excluded.name,
      full_name = excluded.full_name,
      visibility = excluded.visibility,
      is_private = excluded.is_private,
      is_fork = excluded.is_fork,
      is_archived = excluded.is_archived,
      is_disabled = excluded.is_disabled,
      default_branch = excluded.default_branch,
      updated_at = now()
    where selected_repositories.github_installation_id =
      excluded.github_installation_id
    returning * into selected_repository;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'github_repository_selection_storage_failed';
  end;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'github_repository_selection_installation_mismatch';
  end if;

  return selected_repository;
end;
$$;

create function public.remove_selected_github_repository(
  p_user_id uuid,
  p_github_repository_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    delete from public.selected_repositories selection_record
    where selection_record.user_id = p_user_id
      and selection_record.github_repository_id = p_github_repository_id;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'github_repository_selection_storage_failed';
  end;
end;
$$;

comment on function public.ensure_selected_github_repository(
  uuid,
  uuid,
  bigint,
  varchar,
  varchar,
  varchar,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  varchar
) is
  'Atomically creates or refreshes one verified, active-installation GitHub repository selection.';

comment on function public.remove_selected_github_repository(uuid, bigint) is
  'Idempotently removes one current-user GitHub repository selection without consulting GitHub or installation state.';

alter function public.ensure_selected_github_repository(
  uuid,
  uuid,
  bigint,
  varchar,
  varchar,
  varchar,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  varchar
) owner to postgres;

alter function public.remove_selected_github_repository(uuid, bigint)
owner to postgres;

revoke all on function public.ensure_selected_github_repository(
  uuid,
  uuid,
  bigint,
  varchar,
  varchar,
  varchar,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  varchar
) from public, anon, authenticated;

revoke all on function public.remove_selected_github_repository(uuid, bigint)
from public, anon, authenticated;

grant execute on function public.ensure_selected_github_repository(
  uuid,
  uuid,
  bigint,
  varchar,
  varchar,
  varchar,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  varchar
) to service_role;

grant execute on function public.remove_selected_github_repository(uuid, bigint)
to service_role;
