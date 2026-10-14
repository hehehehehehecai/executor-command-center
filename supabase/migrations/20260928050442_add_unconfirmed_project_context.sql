-- logical_migration_id: 0032
-- contract_versions: project-context.v1, project-calibration.v1 (compatible input)
-- Forward only: preserve every existing value; gate new HTTP writers until T05.

alter table public.projects
  alter column core_goal drop not null,
  alter column current_stage_goal drop not null,
  alter column status drop not null;

drop index public.projects_one_active_per_selected_repository_idx;
create unique index projects_one_active_per_selected_repository_idx
on public.projects(selected_repository_id)
where status is distinct from 'archived';

create function app_private.lock_project_context_selection(
  p_actor_user_id uuid, p_selected_repository_id uuid
) returns public.selected_repositories
language plpgsql security definer set search_path = ''
as $$
declare
  selection public.selected_repositories%rowtype;
  installation public.github_installations%rowtype;
  account_status text;
begin
  select candidate.* into selection from public.selected_repositories candidate
  where candidate.id=p_selected_repository_id and candidate.user_id=p_actor_user_id;
  if not found then
    raise exception using errcode='P0002', message='project_context_not_found';
  end if;

  select candidate.* into installation from public.github_installations candidate
  where candidate.id=selection.github_installation_id and candidate.user_id=p_actor_user_id
  for update;
  if not found then
    raise exception using errcode='P0002', message='project_context_not_found';
  end if;
  -- A row returned after waiting is rechecked, not a pre-lock authorization cache.
  if installation.status is distinct from 'active' then
    raise exception using errcode='P0001', message='project_context_authorization_unavailable';
  end if;

  -- Existing removal paths can hold the account gate before the project. Do not
  -- wait while owning an installation lock and create an account/install cycle.
  select operation.status into account_status from public.account_deletion_operations operation
  where operation.user_id=p_actor_user_id for update nowait;
  if not found or account_status is distinct from 'active' then
    raise exception using errcode='P0001', message='project_context_account_unavailable';
  end if;

  select candidate.* into selection from public.selected_repositories candidate
  where candidate.id=p_selected_repository_id and candidate.user_id=p_actor_user_id
    and candidate.github_installation_id=installation.id
  for update;
  if not found then
    raise exception using errcode='P0002', message='project_context_not_found';
  end if;
  if selection.is_archived or selection.is_disabled then
    raise exception using errcode='P0001', message='project_context_repository_unavailable';
  end if;
  return selection;
exception when lock_not_available then
  raise exception using errcode='P0001', message='project_context_conflict';
end;
$$;
alter function app_private.lock_project_context_selection(uuid,uuid) owner to postgres;
revoke all on function app_private.lock_project_context_selection(uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.validate_project_context_patch(p_changes jsonb)
returns void language plpgsql set search_path = ''
as $$
declare field_name text; field_value jsonb; text_value text;
  trim_characters text := E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_changes is null or jsonb_typeof(p_changes) is distinct from 'object' or p_changes='{}'::jsonb then
    raise exception using errcode='P0001', message='project_context_invalid_request';
  end if;
  for field_name,field_value in select key,value from jsonb_each(p_changes) loop
    if field_name not in ('coreGoal','currentStageGoal','status','currentBlocker') then
      raise exception using errcode='P0001', message='project_context_invalid_request';
    end if;
    if jsonb_typeof(field_value)='null' then continue; end if;
    if jsonb_typeof(field_value) is distinct from 'string' then
      raise exception using errcode='P0001', message='project_context_invalid_request';
    end if;
    text_value := p_changes->>field_name;
    if field_name='status' then
      if text_value not in ('in_planning','in_development','polishing','dormant','completed','archived') then
        raise exception using errcode='P0001', message='project_context_invalid_request';
      end if;
    elsif text_value='' or text_value<>btrim(text_value,trim_characters)
      or app_private.utf16_code_units(text_value)>2000 then
      raise exception using errcode='P0001', message='project_context_invalid_request';
    end if;
  end loop;
end;
$$;
alter function app_private.validate_project_context_patch(jsonb) owner to postgres;
revoke all on function app_private.validate_project_context_patch(jsonb) from public,anon,authenticated,service_role;

create function public.create_project_from_repository(p_actor_user_id uuid,p_selected_repository_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare selection public.selected_repositories%rowtype; project public.projects%rowtype;
begin
  selection := app_private.lock_project_context_selection(p_actor_user_id,p_selected_repository_id);
  select candidate.* into project from public.projects candidate
  where candidate.selected_repository_id=selection.id and candidate.status is distinct from 'archived'
  for update;
  if found then
    if project.user_id is distinct from p_actor_user_id then
      raise exception using errcode='P0002',message='project_context_not_found';
    end if;
    if project.repository_data_state is distinct from 'connected' then
      raise exception using errcode='P0001',message='project_context_repository_unavailable';
    end if;
    return to_jsonb(project);
  end if;
  insert into public.projects(user_id,selected_repository_id,core_goal,current_stage_goal,status,current_blocker)
  values(p_actor_user_id,selection.id,null,null,null,null) returning * into project;
  return to_jsonb(project);
exception when unique_violation then
  raise exception using errcode='P0001',message='project_context_conflict';
end;
$$;
alter function public.create_project_from_repository(uuid,uuid) owner to postgres;
revoke all on function public.create_project_from_repository(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_project_from_repository(uuid,uuid) to service_role;

create function public.patch_project_context(p_actor_user_id uuid,p_project_id uuid,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare selection_id uuid; project public.projects%rowtype;
begin
  perform app_private.validate_project_context_patch(p_changes);
  select candidate.selected_repository_id into selection_id from public.projects candidate
  where candidate.id=p_project_id and candidate.user_id=p_actor_user_id;
  if not found then
    raise exception using errcode='P0002',message='project_context_not_found';
  end if;
  perform app_private.lock_project_context_selection(p_actor_user_id,selection_id);
  select candidate.* into project from public.projects candidate
  where candidate.id=p_project_id and candidate.user_id=p_actor_user_id
    and candidate.selected_repository_id=selection_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='project_context_not_found';
  end if;
  if project.status='archived' then
    raise exception using errcode='P0001',message='project_context_archived';
  end if;
  if project.repository_data_state is distinct from 'connected' then
    raise exception using errcode='P0001',message='project_context_repository_unavailable';
  end if;
  update public.projects candidate set
    core_goal=case when p_changes ? 'coreGoal' then p_changes->>'coreGoal' else candidate.core_goal end,
    current_stage_goal=case when p_changes ? 'currentStageGoal' then p_changes->>'currentStageGoal' else candidate.current_stage_goal end,
    status=case when p_changes ? 'status' then p_changes->>'status' else candidate.status end,
    current_blocker=case when p_changes ? 'currentBlocker' then p_changes->>'currentBlocker' else candidate.current_blocker end
  where candidate.id=p_project_id returning * into project;
  return to_jsonb(project);
exception when unique_violation then
  raise exception using errcode='P0001',message='project_context_conflict';
end;
$$;
alter function public.patch_project_context(uuid,uuid,jsonb) owner to postgres;
revoke all on function public.patch_project_context(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.patch_project_context(uuid,uuid,jsonb) to service_role;

-- Preserve the latest audited definitions, with only the compatible write gate
-- and null-aware active predicate changes below. Existing ACLs are retained.
CREATE OR REPLACE FUNCTION public.save_project_calibration(p_user_id uuid, p_selected_repository_id uuid, p_core_goal text, p_current_stage_goal text, p_status text, p_current_blocker text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  selected_repository_record public.selected_repositories%rowtype;
  active_project public.projects%rowtype;
  saved_project public.projects%rowtype;
begin
  select selection_record.*
  into selected_repository_record
  from public.selected_repositories selection_record
  where selection_record.id = p_selected_repository_id
;

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

  if p_core_goal is null or p_current_stage_goal is null or p_status is null then
    raise exception using errcode='23502',message='project_calibration_full_context_required';
  end if;
  selected_repository_record := app_private.lock_project_context_selection(p_user_id,p_selected_repository_id);

  select project_record.*
  into active_project
  from public.projects project_record
  where project_record.selected_repository_id = p_selected_repository_id
    and project_record.status is distinct from 'archived'
  for update;

  if found then
    if active_project.user_id is distinct from p_user_id
      or active_project.repository_data_state is distinct from 'connected' then
      raise exception using errcode='P0001',message='project_calibration_conflict';
    end if;
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
$function$
;
CREATE OR REPLACE FUNCTION public.remove_selected_github_repository(p_user_id uuid, p_github_repository_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and project_record.status is distinct from 'archived'
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
$function$
;
