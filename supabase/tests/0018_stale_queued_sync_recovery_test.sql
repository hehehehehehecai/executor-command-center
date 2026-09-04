begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public',
  'request_project_sync',
  array['uuid','text','text','uuid','timestamp with time zone'],
  'stale recovery keeps the existing request RPC signature'
);
select ok(
  (select prosecdef from pg_proc where oid='public.request_project_sync(uuid,text,text,uuid,timestamptz)'::regprocedure),
  'request RPC remains security definer'
);
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid='public.request_project_sync(uuid,text,text,uuid,timestamptz)'::regprocedure),
  'search_path=""',
  'request RPC keeps an empty search path'
);
select ok(
  has_function_privilege('service_role','public.request_project_sync(uuid,text,text,uuid,timestamptz)','execute')
  and not has_function_privilege('public','public.request_project_sync(uuid,text,text,uuid,timestamptz)','execute')
  and not has_function_privilege('anon','public.request_project_sync(uuid,text,text,uuid,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.request_project_sync(uuid,text,text,uuid,timestamptz)','execute'),
  'request RPC remains service-role only'
);
select ok(
  not has_table_privilege('anon','public.sync_runs','insert,update,delete')
  and not has_table_privilege('authenticated','public.sync_runs','insert,update,delete')
  and not has_table_privilege('service_role','public.sync_runs','insert,update,delete')
  and not has_table_privilege('anon','public.project_sync_dispatches','insert,update,delete')
  and not has_table_privilege('authenticated','public.project_sync_dispatches','insert,update,delete')
  and not has_table_privilege('service_role','public.project_sync_dispatches','insert,update,delete'),
  'browser and service roles gain no direct write privilege'
);

insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  'c9700000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','phase929@example.test','',
  '2026-08-11T11:00:00Z','{}','{}','2026-08-11T11:00:00Z','2026-08-11T11:00:00Z'
);
insert into public.users(id) values ('c9700000-0000-4000-8000-000000000001');
insert into public.github_installations(
  id,user_id,installation_id,github_account_id,github_account_login,
  account_type,repository_selection,status,last_verified_at
) values (
  'c9710000-0000-4000-8000-000000000001',
  'c9700000-0000-4000-8000-000000000001',92901,92901,
  'phase929','User','selected','active','2026-08-11T11:00:00Z'
);
insert into public.selected_repositories(
  id,user_id,github_installation_id,github_repository_id,owner_login,name,
  full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch
) values (
  'c9720000-0000-4000-8000-000000000001',
  'c9700000-0000-4000-8000-000000000001',
  'c9710000-0000-4000-8000-000000000001',92901,
  'synthetic','phase929','synthetic/phase929','private',true,false,false,false,'main'
);
insert into public.projects(
  id,user_id,selected_repository_id,core_goal,current_stage_goal,status
) values (
  'c9730000-0000-4000-8000-000000000001',
  'c9700000-0000-4000-8000-000000000001',
  'c9720000-0000-4000-8000-000000000001',
  'Recover a synthetic stale run','Verify deterministic coalescing','in_development'
);

-- A never-started queued run older than fifteen minutes is terminalized atomically,
-- while its historical dispatch remains intact and a new request is created.
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,
  queued_at,started_at,finished_at,last_progress_at,progress_cursor,
  created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000001',
  'c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:stale-original','first_sync','queued',1,
  '2026-08-11T11:44:59Z',null,null,null,null,
  '2026-08-11T11:44:59Z','2026-08-11T11:44:59Z'
);
insert into public.project_sync_dispatches(
  id,project_id,sync_run_id,request_identity,trigger_source,requested_at,created_at,updated_at
) values (
  'c9750000-0000-4000-8000-000000000001',
  'c9730000-0000-4000-8000-000000000001',
  'c9740000-0000-4000-8000-000000000001',
  'first_sync:stale-original','first_sync',
  '2026-08-11T11:44:59Z','2026-08-11T11:44:59Z','2026-08-11T11:44:59Z'
);
create temporary table recovered_request as
select public.request_project_sync(
  'c9730000-0000-4000-8000-000000000001',
  'webhook','webhook:new-delivery',null,'2026-08-11T12:00:00Z'
) value;
select is((select value->>'outcome' from recovered_request),'new','different identity recovers stale queued run and creates a new request');
select is((select value->>'sync_run_status' from recovered_request),'queued','replacement run starts queued');
select is((select value->>'dispatch_status' from recovered_request),'pending','replacement dispatch starts pending');
select results_eq(
  $$select status,version,finished_at,error_code,error_summary from public.sync_runs where id='c9740000-0000-4000-8000-000000000001'$$,
  $$values ('failed'::text,2::bigint,'2026-08-11T12:00:00Z'::timestamptz,'sync_run_stale_queued'::text,'Stale queued sync request recovered.'::text)$$,
  'stale run reaches a deterministic safe terminal state'
);
select is(
  (select count(*)::text from public.project_sync_dispatches where id='c9750000-0000-4000-8000-000000000001'),
  '1',
  'historical dispatch is preserved'
);
select results_eq(
  $$select trigger_source,idempotency_key from public.sync_runs where id=(select (value->>'sync_run_id')::uuid from recovered_request)$$,
  $$values ('webhook'::text,'sync-request:webhook:new-delivery'::text)$$,
  'new run keeps its own trigger and identity lineage'
);
select is((select count(*)::text from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001'),'2','recovery preserves old run and creates exactly one replacement');
select is((select count(*)::text from public.project_sync_dispatches where project_id='c9730000-0000-4000-8000-000000000001'),'2','recovery preserves old dispatch and creates exactly one replacement dispatch');
select ok(
  (select error_summary !~* '(webhook:new-delivery|token|payload|authorization|cookie)' from public.sync_runs where id='c9740000-0000-4000-8000-000000000001'),
  'terminal summary is low-cardinality and contains no request identity or secret label'
);

-- Exactly fifteen minutes is stale.
delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000002','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:exact-boundary','first_sync','queued',1,
  '2026-08-11T11:45:00Z','2026-08-11T11:45:00Z','2026-08-11T11:45:00Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','manual','manual:exact-boundary','c9700000-0000-4000-8000-000000000001','2026-08-11T12:00:00Z')->>'outcome',
  'new',
  'exactly fifteen minutes is stale'
);
select results_eq(
  $$select status,version,finished_at from public.sync_runs where id='c9740000-0000-4000-8000-000000000002'$$,
  $$values ('failed'::text,2::bigint,'2026-08-11T12:00:00Z'::timestamptz)$$,
  'exact-boundary recovery is driven by p_requested_at'
);

-- One millisecond inside the threshold remains live and coalesces.
delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000003','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:live-boundary','first_sync','queued',1,
  '2026-08-11T11:45:00.001Z','2026-08-11T11:45:00.001Z','2026-08-11T11:45:00.001Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','webhook','webhook:live-boundary',null,'2026-08-11T12:00:00Z')->>'outcome',
  'coalesced',
  'queued run younger than fifteen minutes remains live'
);
select results_eq(
  $$select status,version,finished_at from public.sync_runs where id='c9740000-0000-4000-8000-000000000003'$$,
  $$values ('queued'::text,1::bigint,null::timestamptz)$$,
  'live queued run remains unchanged'
);

-- Any progress or recent created/updated fact protects a queued run from recovery.
delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,last_progress_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000004','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:has-progress-time','first_sync','queued',2,
  '2026-08-11T11:00:00Z','2026-08-11T11:20:00Z','2026-08-11T11:00:00Z','2026-08-11T11:20:00Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','webhook','webhook:progress-time',null,'2026-08-11T12:00:00Z')->>'outcome',
  'coalesced',
  'queued run with progress timestamp is protected'
);
select is((select status from public.sync_runs where id='c9740000-0000-4000-8000-000000000004'),'queued','progress timestamp run is not terminalized');

delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,progress_cursor,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000005','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:has-cursor','first_sync','queued',2,
  '2026-08-11T11:00:00Z','synthetic-safe-cursor','2026-08-11T11:00:00Z','2026-08-11T11:00:00Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','webhook','webhook:cursor',null,'2026-08-11T12:00:00Z')->>'outcome',
  'coalesced',
  'queued run with progress cursor is protected'
);
select is((select status from public.sync_runs where id='c9740000-0000-4000-8000-000000000005'),'queued','progress cursor run is not terminalized');

delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000006','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:recent-created','first_sync','queued',1,
  '2026-08-11T11:00:00Z','2026-08-11T11:45:01Z','2026-08-11T11:00:00Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','webhook','webhook:recent-created',null,'2026-08-11T12:00:00Z')->>'outcome',
  'coalesced',
  'recent created_at protects queued run'
);

delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000007','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:recent-updated','first_sync','queued',1,
  '2026-08-11T11:00:00Z','2026-08-11T11:00:00Z','2026-08-11T11:45:01Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','webhook','webhook:recent-updated',null,'2026-08-11T12:00:00Z')->>'outcome',
  'coalesced',
  'recent updated_at protects queued run'
);

-- Running is coalesced and partial history permits a new run; neither is overwritten.
delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,started_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000008','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:running','first_sync','running',3,
  '2026-08-11T10:00:00Z','2026-08-11T10:00:01Z','2026-08-11T10:00:00Z','2026-08-11T10:00:01Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','reconciliation','reconciliation:running',null,'2026-08-11T12:00:00Z')->>'outcome',
  'coalesced',
  'running run remains the active coalescing target'
);
select results_eq(
  $$select status,version,finished_at from public.sync_runs where id='c9740000-0000-4000-8000-000000000008'$$,
  $$values ('running'::text,3::bigint,null::timestamptz)$$,
  'running run is not terminalized'
);

delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,started_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000009','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:partial','first_sync','partial',4,
  '2026-08-11T10:00:00Z','2026-08-11T10:00:01Z','2026-08-11T10:00:00Z','2026-08-11T10:00:01Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','manual','manual:after-partial','c9700000-0000-4000-8000-000000000001','2026-08-11T12:00:00Z')->>'outcome',
  'new',
  'partial history does not occupy the queued/running coalescing slot'
);
select results_eq(
  $$select status,version,finished_at from public.sync_runs where id='c9740000-0000-4000-8000-000000000009'$$,
  $$values ('partial'::text,4::bigint,null::timestamptz)$$,
  'partial history is not overwritten'
);

-- Same identity remains duplicate even when its queued run is stale.
delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000010','c9730000-0000-4000-8000-000000000001',
  'sync-request:webhook:same-identity','webhook','queued',1,
  '2026-08-11T11:00:00Z','2026-08-11T11:00:00Z','2026-08-11T11:00:00Z'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','webhook','webhook:same-identity',null,'2026-08-11T12:00:00Z')->>'outcome',
  'duplicate',
  'same identity duplicate is evaluated before stale recovery'
);
select results_eq(
  $$select status,version,finished_at from public.sync_runs where id='c9740000-0000-4000-8000-000000000010'$$,
  $$values ('queued'::text,1::bigint,null::timestamptz)$$,
  'duplicate does not mutate its historical run'
);
select is((select count(*)::text from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001'),'1','duplicate creates no second run');

-- Advisory-lock-serialized equivalent calls converge on one replacement run/dispatch.
delete from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001';
insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,created_at,updated_at
) values (
  'c9740000-0000-4000-8000-000000000011','c9730000-0000-4000-8000-000000000001',
  'sync-request:first_sync:serialized-stale','first_sync','queued',1,
  '2026-08-11T11:00:00Z','2026-08-11T11:00:00Z','2026-08-11T11:00:00Z'
);
create temporary table serialized_first as
select public.request_project_sync(
  'c9730000-0000-4000-8000-000000000001','webhook','webhook:serialized',null,'2026-08-11T12:00:00Z'
) value;
select is((select value->>'outcome' from serialized_first),'new','first serialized request creates one replacement');
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','webhook','webhook:serialized',null,'2026-08-11T12:00:00Z')->>'outcome',
  'duplicate',
  'equivalent replay is duplicate'
);
select is(
  public.request_project_sync('c9730000-0000-4000-8000-000000000001','reconciliation','reconciliation:serialized',null,'2026-08-11T12:00:00Z')->>'outcome',
  'coalesced',
  'different concurrent-equivalent identity coalesces to replacement'
);
select is((select count(*)::text from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001'),'2','serialized recovery creates only old failed plus one new run');
select is((select count(*)::text from public.project_sync_dispatches where project_id='c9730000-0000-4000-8000-000000000001'),'1','serialized recovery creates one dispatch');
select is(
  (select count(*)::text from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001' and status='queued'),
  '1',
  'serialized recovery leaves one active queued run'
);
select is(
  (select count(*)::text from public.sync_runs where project_id='c9730000-0000-4000-8000-000000000001' and status='failed' and error_code='sync_run_stale_queued'),
  '1',
  'serialized recovery terminalizes the stale run exactly once'
);
select is(
  (select value->>'sync_run_id' from serialized_first),
  (select sync_run_id::text from public.project_sync_dispatches where project_id='c9730000-0000-4000-8000-000000000001'),
  'replacement run and sole dispatch retain one logical lineage'
);

select ok(
  (select pg_get_functiondef('public.request_project_sync(uuid,text,text,uuid,timestamptz)'::regprocedure) like '%pg_advisory_xact_lock%'),
  'project advisory transaction lock remains in the production function'
);
select ok(
  not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sync_runs'
      and column_name in ('raw_payload','raw_response','secret','token','authorization','signature','cookie')
  ),
  'sync run schema stores no raw or sensitive fields'
);

select * from finish();
rollback;
