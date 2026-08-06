-- logical_migration_id: 0013
-- contract_versions: github-webhook-delivery.v1, github-webhook-ingestion.v1

create table public.github_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_]{0,63}$'),
  action text check (action is null or action ~ '^[a-z][a-z0-9_]{0,63}$'),
  installation_id bigint check (installation_id is null or installation_id > 0),
  repository_id bigint check (repository_id is null or repository_id > 0),
  repository_full_name text check (repository_full_name is null or (repository_full_name=btrim(repository_full_name) and repository_full_name like '%/%')),
  project_id uuid references public.projects(id) on delete set null,
  internal_event_id text not null unique check (internal_event_id ~ '^github-webhook:[0-9a-f-]{36}$'),
  status text not null check (status in ('pending','dispatching','dispatched','ignored','completed')),
  provider_receipt_id text check (provider_receipt_id is null or provider_receipt_id ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$'),
  dispatch_lease_until timestamptz,
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  version bigint not null default 1 check (version > 0),
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='dispatching' and dispatch_lease_until is not null and provider_receipt_id is null) or (status='dispatched' and dispatch_lease_until is null and provider_receipt_id is not null) or (status in ('pending','ignored','completed') and dispatch_lease_until is null and provider_receipt_id is null))
);
comment on table public.github_webhook_deliveries is 'Verified GitHub delivery inbox. Stores only structured lineage and body digest; never raw bodies, signatures or credentials.';
create index github_webhook_deliveries_project_received_idx on public.github_webhook_deliveries(project_id,received_at desc);
create index github_webhook_deliveries_recoverable_idx on public.github_webhook_deliveries(status,dispatch_lease_until) where status in ('pending','dispatching');
create trigger github_webhook_deliveries_set_updated_at before update on public.github_webhook_deliveries for each row execute function app_private.set_updated_at();
alter table public.github_webhook_deliveries enable row level security;
revoke all on table public.github_webhook_deliveries from public,anon,authenticated,service_role;

create function public.register_github_webhook_delivery(p_delivery_id uuid,p_body_sha256 text,p_event_name text,p_action text,p_installation_id bigint,p_repository_id bigint,p_repository_full_name text,p_internal_event_id text,p_supported boolean,p_received_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.github_webhook_deliveries%rowtype; mapped_project uuid; initial_status text;
begin
  if p_body_sha256 !~ '^[0-9a-f]{64}$' or p_event_name !~ '^[a-z][a-z0-9_]{0,63}$' or p_internal_event_id <> 'github-webhook:'||p_delivery_id::text then raise exception using message='github_webhook_delivery_invalid'; end if;
  if p_event_name='installation' then initial_status:='pending';
  elsif not p_supported then initial_status:='ignored';
  else
    select p.id into mapped_project from public.github_installations gi join public.selected_repositories sr on sr.github_installation_id=gi.id join public.projects p on p.selected_repository_id=sr.id where gi.installation_id=p_installation_id and gi.status='active' and sr.github_repository_id=p_repository_id and sr.full_name=p_repository_full_name;
    initial_status:=case when mapped_project is null then 'ignored' else 'pending' end;
  end if;
  insert into public.github_webhook_deliveries(delivery_id,body_sha256,event_name,action,installation_id,repository_id,repository_full_name,project_id,internal_event_id,status,received_at)
  values(p_delivery_id,p_body_sha256,p_event_name,p_action,p_installation_id,p_repository_id,p_repository_full_name,mapped_project,p_internal_event_id,initial_status,p_received_at) on conflict(delivery_id) do nothing;
  if found then return jsonb_build_object('outcome','new','status',initial_status,'version',1,'project_id',mapped_project); end if;
  select * into existing from public.github_webhook_deliveries where delivery_id=p_delivery_id for update;
  if existing.body_sha256 is distinct from p_body_sha256 or existing.event_name is distinct from p_event_name or existing.action is distinct from p_action or existing.installation_id is distinct from p_installation_id or existing.repository_id is distinct from p_repository_id or existing.repository_full_name is distinct from p_repository_full_name or existing.internal_event_id is distinct from p_internal_event_id then
    return jsonb_build_object('outcome','conflict','status',existing.status,'version',existing.version,'project_id',existing.project_id);
  end if;
  return jsonb_build_object('outcome','duplicate','status',existing.status,'version',existing.version,'project_id',existing.project_id);
end; $$;

create function public.claim_github_webhook_dispatch(p_delivery_id uuid,p_expected_version bigint,p_claimed_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare updated_version bigint; current_version bigint;
begin
  update public.github_webhook_deliveries set status='dispatching',dispatch_lease_until=p_claimed_at+interval '60 seconds',version=version+1 where delivery_id=p_delivery_id and version=p_expected_version and (status='pending' or (status='dispatching' and dispatch_lease_until<=p_claimed_at)) returning version into updated_version;
  if updated_version is not null then return jsonb_build_object('claimed',true,'version',updated_version); end if;
  select version into current_version from public.github_webhook_deliveries where delivery_id=p_delivery_id;
  return jsonb_build_object('claimed',false,'version',coalesce(current_version,p_expected_version));
end; $$;

create function public.complete_github_webhook_dispatch(p_delivery_id uuid,p_expected_version bigint,p_provider_receipt_id text,p_completed_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.github_webhook_deliveries set status='dispatched',provider_receipt_id=p_provider_receipt_id,dispatch_lease_until=null,version=version+1,updated_at=p_completed_at where delivery_id=p_delivery_id and version=p_expected_version and status='dispatching';
  if not found then raise exception using message='github_webhook_delivery_concurrency_conflict'; end if; return jsonb_build_object('completed',true);
end; $$;

create function public.complete_github_webhook_installation(p_delivery_id uuid,p_expected_version bigint,p_installation_state text,p_completed_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_installation bigint;
begin
  if p_installation_state not in ('active','suspended','revoked') then raise exception using message='github_webhook_installation_state_invalid'; end if;
  select installation_id into target_installation from public.github_webhook_deliveries where delivery_id=p_delivery_id and version=p_expected_version and status='pending' and event_name='installation' for update;
  if target_installation is null then raise exception using message='github_webhook_delivery_concurrency_conflict'; end if;
  if p_installation_state='revoked' then update public.github_installations set status='revoked',suspended_at=null,revoked_at=p_completed_at where installation_id=target_installation;
  elsif p_installation_state='suspended' then update public.github_installations set status='suspended',suspended_at=p_completed_at,revoked_at=null where installation_id=target_installation and status<>'revoked';
  else update public.github_installations set status='active',suspended_at=null,revoked_at=null where installation_id=target_installation and status='suspended'; end if;
  update public.github_webhook_deliveries set status='completed',version=version+1,updated_at=p_completed_at where delivery_id=p_delivery_id and version=p_expected_version;
  return jsonb_build_object('completed',true);
end; $$;

revoke all on function public.register_github_webhook_delivery(uuid,text,text,text,bigint,bigint,text,text,boolean,timestamptz),public.claim_github_webhook_dispatch(uuid,bigint,timestamptz),public.complete_github_webhook_dispatch(uuid,bigint,text,timestamptz),public.complete_github_webhook_installation(uuid,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.register_github_webhook_delivery(uuid,text,text,text,bigint,bigint,text,text,boolean,timestamptz),public.claim_github_webhook_dispatch(uuid,bigint,timestamptz),public.complete_github_webhook_dispatch(uuid,bigint,text,timestamptz),public.complete_github_webhook_installation(uuid,bigint,text,timestamptz) to service_role;
