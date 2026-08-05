-- logical_migration_id: 0006
-- contract_versions: project-calibration.v1,
--                    project-calibration-storage.v1
-- purpose: atomically persist current-user project calibration

create function app_private.utf16_code_units(value text)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select char_length(value) + coalesce(
    (
      select count(*)::integer
      from unnest(string_to_array(value, null)) character_record
      where octet_length(character_record) = 4
    ),
    0
  );
$$;

alter function app_private.utf16_code_units(text) owner to postgres;
revoke all on function app_private.utf16_code_units(text)
from public, anon, authenticated, service_role;

create table public.projects (
  id uuid constraint projects_pkey primary key default gen_random_uuid(),
  user_id uuid not null,
  selected_repository_id uuid not null,
  core_goal text not null,
  current_stage_goal text not null,
  status text not null,
  current_blocker text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_user_id_fkey
    foreign key (user_id) references public.users(id) on delete cascade,
  constraint projects_selected_repository_id_fkey
    foreign key (selected_repository_id)
    references public.selected_repositories(id) on delete cascade,
  constraint projects_core_goal_check check (
    core_goal = btrim(core_goal)
    and core_goal <> ''
    and app_private.utf16_code_units(core_goal) <= 2000
  ),
  constraint projects_current_stage_goal_check check (
    current_stage_goal = btrim(current_stage_goal)
    and current_stage_goal <> ''
    and app_private.utf16_code_units(current_stage_goal) <= 2000
  ),
  constraint projects_status_check check (
    status in (
      'in_planning',
      'in_development',
      'polishing',
      'dormant',
      'completed',
      'archived'
    )
  ),
  constraint projects_current_blocker_check check (
    current_blocker is null
    or (
      current_blocker = btrim(current_blocker)
      and current_blocker <> ''
      and app_private.utf16_code_units(current_blocker) <= 2000
    )
  )
);

comment on table public.projects is
  'User-authored MVP project calibration linked to a verified selected repository. GitHub repository facts, repository contents, tokens, raw payloads, issues, pull requests, commits and synchronization state are intentionally excluded.';

create unique index projects_one_active_per_selected_repository_idx
on public.projects (selected_repository_id)
where status <> 'archived';

create index projects_user_sort_idx
on public.projects (user_id, updated_at desc, id);

create trigger projects_set_updated_at
before update on public.projects
for each row execute function app_private.set_updated_at();

alter table public.projects enable row level security;
revoke all on table public.projects
from public, anon, authenticated, service_role;

create policy projects_select_own
on public.projects
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on table public.projects to authenticated;

create function public.save_project_calibration(
  p_user_id uuid,
  p_selected_repository_id uuid,
  p_core_goal text,
  p_current_stage_goal text,
  p_status text,
  p_current_blocker text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_repository_record public.selected_repositories%rowtype;
  active_project public.projects%rowtype;
  saved_project public.projects%rowtype;
begin
  select selection_record.*
  into selected_repository_record
  from public.selected_repositories selection_record
  where selection_record.id = p_selected_repository_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'project_calibration_selected_repository_not_found';
  end if;

  if selected_repository_record.user_id is distinct from p_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'project_calibration_selected_repository_wrong_user';
  end if;

  select project_record.*
  into active_project
  from public.projects project_record
  where project_record.selected_repository_id = p_selected_repository_id
    and project_record.status <> 'archived'
  for update;

  if found then
    update public.projects project_record
    set
      core_goal = p_core_goal,
      current_stage_goal = p_current_stage_goal,
      status = p_status,
      current_blocker = p_current_blocker,
      updated_at = now()
    where project_record.id = active_project.id
    returning * into saved_project;
  else
    if p_status = 'archived' then
      raise exception using
        errcode = 'P0001',
        message = 'project_calibration_conflict';
    end if;

    insert into public.projects (
      user_id,
      selected_repository_id,
      core_goal,
      current_stage_goal,
      status,
      current_blocker
    )
    values (
      p_user_id,
      p_selected_repository_id,
      p_core_goal,
      p_current_stage_goal,
      p_status,
      p_current_blocker
    )
    returning * into saved_project;
  end if;

  return to_jsonb(saved_project) || jsonb_build_object(
    'selected_repositories',
    jsonb_build_object(
      'id', selected_repository_record.id,
      'github_repository_id', selected_repository_record.github_repository_id,
      'full_name', selected_repository_record.full_name,
      'visibility', selected_repository_record.visibility,
      'default_branch', selected_repository_record.default_branch,
      'projects', '[]'::jsonb
    )
  );
exception
  when unique_violation then
    raise exception using
      errcode = 'P0001',
      message = 'project_calibration_conflict';
end;
$$;

comment on function public.save_project_calibration(
  uuid, uuid, text, text, text, text
) is
  'Atomically creates or updates the current active project calibration after locking and verifying selected repository ownership.';

alter function public.save_project_calibration(
  uuid, uuid, text, text, text, text
) owner to postgres;

revoke all on function public.save_project_calibration(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.save_project_calibration(
  uuid, uuid, text, text, text, text
) to service_role;

create or replace function public.remove_selected_github_repository(
  p_user_id uuid,
  p_github_repository_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_selected_repository_id uuid;
begin
  select selection_record.id
  into target_selected_repository_id
  from public.selected_repositories selection_record
  where selection_record.user_id = p_user_id
    and selection_record.github_repository_id = p_github_repository_id
  for update;

  if not found then
    return;
  end if;

  if exists (
    select 1
    from public.projects project_record
    where project_record.selected_repository_id =
      target_selected_repository_id
      and project_record.status <> 'archived'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'github_repository_selection_active_project_conflict';
  end if;

  delete from public.selected_repositories selection_record
  where selection_record.id = target_selected_repository_id;
exception
  when raise_exception then
    if sqlerrm = 'github_repository_selection_active_project_conflict' then
      raise exception using
        errcode = 'P0001',
        message = 'github_repository_selection_active_project_conflict';
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'github_repository_selection_storage_failed';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'github_repository_selection_storage_failed';
end;
$$;

comment on function public.remove_selected_github_repository(uuid, bigint) is
  'Idempotently removes one current-user selection unless an active project calibration still references it.';

alter function public.remove_selected_github_repository(uuid, bigint)
owner to postgres;

revoke all on function public.remove_selected_github_repository(uuid, bigint)
from public, anon, authenticated;

grant execute on function public.remove_selected_github_repository(uuid, bigint)
to service_role;
