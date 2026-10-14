-- contract: t09-decision-persistence.v1
-- Forward-only addition. Existing projects, nullable context and migrations stay intact.

create table public.decision_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  idempotency_key uuid not null,
  version integer not null default 1 check (version > 0),
  decision text not null check (length(btrim(decision)) > 0),
  confirmation_reason text not null check (length(btrim(confirmation_reason)) > 0),
  alternatives text[] not null default '{}',
  "references" jsonb not null default '[]'::jsonb check (jsonb_typeof("references") = 'array'),
  status text not null default 'active' check (status in ('active','revisit_due','superseded')),
  revisit_condition text,
  created_via text not null default 'manual' check (created_via in ('manual','candidate_confirmation')),
  confirmed_by uuid not null default auth.uid() check (confirmed_by = user_id),
  confirmed_at timestamptz not null default clock_timestamp(),
  source_candidate_id text,
  constraint decision_records_manual_source check (created_via <> 'manual' or source_candidate_id is null),
  constraint decision_records_owner_project_key unique (user_id,project_id,idempotency_key)
);

create index decision_records_owner_project_confirmed_idx
  on public.decision_records(user_id,project_id,confirmed_at desc);

-- The account lifecycle table is deliberately unavailable to authenticated clients.
-- This private boolean lookup checks auth.uid() and reveals no foreign rows.
create function app_private.can_access_decision_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.projects project
    join public.selected_repositories repository on repository.id=project.selected_repository_id
    join public.github_installations installation on installation.id=repository.github_installation_id
    join public.account_deletion_operations account on account.user_id=project.user_id
    where project.id=p_project_id and project.user_id=auth.uid()
      and repository.user_id=auth.uid() and installation.user_id=auth.uid()
      and project.repository_data_state='connected' and project.status is distinct from 'archived'
      and not repository.is_archived and not repository.is_disabled
      and installation.status='active' and account.status='active'
  );
$$;
alter function app_private.can_access_decision_project(uuid) owner to postgres;
revoke all on function app_private.can_access_decision_project(uuid) from public,anon,authenticated,service_role;
revoke usage on schema app_private from authenticated;
grant execute on function app_private.can_access_decision_project(uuid) to authenticated;

alter table public.decision_records enable row level security;
alter table public.decision_records force row level security;
revoke all on public.decision_records from public,anon,authenticated,service_role;
grant select on public.decision_records to authenticated;

create policy decision_records_owner_read on public.decision_records for select to authenticated
  using (user_id=(select auth.uid()) and app_private.can_access_decision_project(project_id));
-- A private implementation reuses the existing account/installation/repository
-- write lock. Only the server role can delegate an already verified actor.
create function app_private.create_manual_decision_record(
  p_actor_user_id uuid, p_project_id uuid, p_idempotency_key uuid, p_decision text, p_confirmation_reason text,
  p_alternatives text[], p_references jsonb, p_revisit_condition text
) returns public.decision_records language plpgsql security definer set search_path = ''
as $$
declare saved public.decision_records%rowtype; project public.projects%rowtype;
begin
  if p_actor_user_id is null or auth.uid() is not null then
    raise exception using errcode='42501',message='decision_record_forbidden';
  end if;
  select * into project from public.projects where id=p_project_id and user_id=p_actor_user_id;
  if not found then raise exception using errcode='42501',message='decision_record_forbidden'; end if;
  perform app_private.lock_project_context_selection(p_actor_user_id,project.selected_repository_id);
  select * into project from public.projects where id=p_project_id and user_id=p_actor_user_id for update;
  if not found or project.status='archived' or project.repository_data_state is distinct from 'connected' then
    raise exception using errcode='42501',message='decision_record_forbidden';
  end if;
  insert into public.decision_records(user_id,project_id,idempotency_key,decision,confirmation_reason,alternatives,"references",revisit_condition,confirmed_by)
    values(p_actor_user_id,p_project_id,p_idempotency_key,p_decision,p_confirmation_reason,p_alternatives,p_references,p_revisit_condition,p_actor_user_id)
    on conflict (user_id,project_id,idempotency_key) do nothing
    returning * into saved;
  if found then return saved; end if;

  select * into saved from public.decision_records
    where user_id=p_actor_user_id and project_id=p_project_id and idempotency_key=p_idempotency_key;
  if not found then
    raise exception using errcode='42501',message='decision_record_forbidden';
  end if;
  if saved.decision is distinct from p_decision
    or saved.confirmation_reason is distinct from p_confirmation_reason
    or saved.alternatives is distinct from p_alternatives
    or saved."references" is distinct from p_references
    or saved.revisit_condition is distinct from p_revisit_condition then
    raise exception using errcode='P0001',message='decision_record_conflict';
  end if;
  return saved;
exception when raise_exception then
  if sqlerrm in ('project_context_authorization_unavailable','project_context_account_unavailable','project_context_repository_unavailable') then
    raise exception using errcode='42501',message='decision_record_forbidden';
  end if;
  raise;
end;
$$;
alter function app_private.create_manual_decision_record(uuid,uuid,uuid,text,text,text[],jsonb,text) owner to postgres;
revoke all on function app_private.create_manual_decision_record(uuid,uuid,uuid,text,text,text[],jsonb,text) from public,anon,authenticated,service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.create_manual_decision_record(uuid,uuid,uuid,text,text,text[],jsonb,text) to service_role;

create function public.create_manual_decision_record(
  p_actor_user_id uuid, p_project_id uuid, p_idempotency_key uuid, p_decision text, p_confirmation_reason text,
  p_alternatives text[], p_references jsonb, p_revisit_condition text
) returns public.decision_records language sql security invoker set search_path = ''
as $$
  select app_private.create_manual_decision_record(p_actor_user_id,p_project_id,p_idempotency_key,p_decision,p_confirmation_reason,p_alternatives,p_references,p_revisit_condition);
$$;
revoke all on function public.create_manual_decision_record(uuid,uuid,uuid,text,text,text[],jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.create_manual_decision_record(uuid,uuid,uuid,text,text,text[],jsonb,text) to service_role;

notify pgrst, 'reload schema';
