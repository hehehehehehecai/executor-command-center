begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'project_sync_dispatches', 'project sync dispatch inbox exists');
select has_column('public', 'project_sync_dispatches', 'request_identity', 'stable request identity stored');
select has_column('public', 'project_sync_dispatches', 'sync_run_id', 'dispatch binds one SyncRun');
select has_column('public', 'project_sync_dispatches', 'dispatch_status', 'dispatch state stored');
select has_column('public', 'project_sync_dispatches', 'provider_job_id', 'safe provider receipt stored');
select has_function('public', 'list_reconciliation_projects', array['timestamp with time zone'], 'eligible project reader exists');
select has_function('public', 'request_project_sync', array['uuid','text','text','uuid','timestamp with time zone'], 'coalescing request RPC exists');
select has_function('public', 'claim_project_sync_dispatch', array['uuid','uuid','bigint','timestamp with time zone'], 'dispatch claim RPC exists');
select has_function('public', 'complete_project_sync_dispatch', array['uuid','uuid','bigint','text','timestamp with time zone'], 'dispatch completion RPC exists');
select ok((select relrowsecurity from pg_class where oid='public.project_sync_dispatches'::regclass), 'dispatch inbox RLS enabled');
select ok(
  not has_table_privilege('anon','public.project_sync_dispatches','select,insert,update,delete')
  and not has_table_privilege('authenticated','public.project_sync_dispatches','select,insert,update,delete')
  and not has_table_privilege('service_role','public.project_sync_dispatches','select,insert,update,delete'),
  'no role has direct dispatch inbox access'
);
select ok(
  has_function_privilege('service_role','public.request_project_sync(uuid,text,text,uuid,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.request_project_sync(uuid,text,text,uuid,timestamptz)','execute')
  and not has_function_privilege('anon','public.request_project_sync(uuid,text,text,uuid,timestamptz)','execute'),
  'request RPC is service-role only'
);
select ok(
  has_function_privilege('service_role','public.list_reconciliation_projects(timestamptz)','execute')
  and not has_function_privilege('authenticated','public.list_reconciliation_projects(timestamptz)','execute')
  and not has_function_privilege('anon','public.list_reconciliation_projects(timestamptz)','execute'),
  'eligible Project reader is service-role only'
);
select ok(
  has_function_privilege('service_role','public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)','execute')
  and not has_function_privilege('anon','public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)','execute'),
  'dispatch claim is service-role only'
);
select ok(
  has_function_privilege('service_role','public.complete_project_sync_dispatch(uuid,uuid,bigint,text,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.complete_project_sync_dispatch(uuid,uuid,bigint,text,timestamptz)','execute')
  and not has_function_privilege('anon','public.complete_project_sync_dispatch(uuid,uuid,bigint,text,timestamptz)','execute'),
  'dispatch completion is service-role only'
);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('a7700000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase7-a@example.test','',now(),'{}','{}',now(),now()),
('b7700000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase7-b@example.test','',now(),'{}','{}',now(),now());
insert into public.users(id) values
('a7700000-0000-4000-8000-000000000001'),
('b7700000-0000-4000-8000-000000000002');

insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at,suspended_at,revoked_at) values
('a7710000-0000-4000-8000-000000000001','a7700000-0000-4000-8000-000000000001',87101,77101,'phase7-a','User','selected','active',now(),null,null),
('a7710000-0000-4000-8000-000000000002','a7700000-0000-4000-8000-000000000001',87102,77102,'phase7-suspended','User','selected','suspended',now(),'2026-08-05T00:00:00Z',null),
('a7710000-0000-4000-8000-000000000003','a7700000-0000-4000-8000-000000000001',87103,77103,'phase7-revoked','User','selected','revoked',now(),null,'2026-08-05T00:00:00Z'),
('b7710000-0000-4000-8000-000000000004','b7700000-0000-4000-8000-000000000002',87104,77104,'phase7-b','User','selected','active',now(),null,null);

insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch) values
('a7720000-0000-4000-8000-000000000001','a7700000-0000-4000-8000-000000000001','a7710000-0000-4000-8000-000000000001',97101,'owner-a','repo-a','owner-a/repo-a','private',true,false,false,false,'main'),
('a7720000-0000-4000-8000-000000000002','a7700000-0000-4000-8000-000000000001','a7710000-0000-4000-8000-000000000002',97102,'owner-a','repo-s','owner-a/repo-s','private',true,false,false,false,'main'),
('a7720000-0000-4000-8000-000000000003','a7700000-0000-4000-8000-000000000001','a7710000-0000-4000-8000-000000000003',97103,'owner-a','repo-r','owner-a/repo-r','private',true,false,false,false,'main'),
('b7720000-0000-4000-8000-000000000004','b7700000-0000-4000-8000-000000000002','b7710000-0000-4000-8000-000000000004',97104,'owner-b','repo-b','owner-b/repo-b','private',true,false,false,false,'main');

insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status) values
('a7730000-0000-4000-8000-000000000001','a7700000-0000-4000-8000-000000000001','a7720000-0000-4000-8000-000000000001','phase7 active','reconcile','in_development'),
('a7730000-0000-4000-8000-000000000002','a7700000-0000-4000-8000-000000000001','a7720000-0000-4000-8000-000000000002','phase7 suspended','reconcile','in_planning'),
('a7730000-0000-4000-8000-000000000003','a7700000-0000-4000-8000-000000000001','a7720000-0000-4000-8000-000000000003','phase7 revoked','reconcile','polishing'),
('b7730000-0000-4000-8000-000000000004','b7700000-0000-4000-8000-000000000002','b7720000-0000-4000-8000-000000000004','phase7 user b','reconcile','in_development');

insert into public.github_repository_snapshots(project_id,github_object_id,source_updated_at,source_version,repository_full_name,default_branch,visibility,is_private,is_fork,is_archived,is_disabled) values
('a7730000-0000-4000-8000-000000000001','97101','2026-08-05T00:00:00Z','repo-v1','owner-a/repo-a','main','private',true,false,false,false);
insert into public.github_issues(project_id,github_object_id,source_updated_at,source_version,issue_number,title,state) values
('a7730000-0000-4000-8000-000000000001','98101','2026-08-05T00:00:00Z','issue-v1',1,'Synthetic issue','open');

create temporary table eligible as
select public.list_reconciliation_projects('2026-05-09T00:00:00Z') value;
select is(jsonb_array_length((select value from eligible))::text,'4','all eligible project statuses are listed including blocked installations');
select is(((select value from eligible)->0->'local_facts'->>'repository')::text, lower((select value->0->'local_facts'->>'repository' from eligible)), 'local repository fact is canonical lowercase digest');
select is(length((select value->0->'local_facts'->>'issue' from eligible))::text,'64','local issue collection uses fixed SHA-256 digest');

select is(
  public.request_project_sync('b7730000-0000-4000-8000-000000000004','manual','manual:cross-owner','a7700000-0000-4000-8000-000000000001','2026-08-06T03:00:00Z')->>'outcome',
  'forbidden',
  'manual request cannot target another user Project'
);
select is((select count(*)::text from public.sync_runs where project_id='b7730000-0000-4000-8000-000000000004'),'0','forbidden manual request creates no SyncRun');

create temporary table first_request as
select public.request_project_sync('a7730000-0000-4000-8000-000000000001','manual','manual:request-001','a7700000-0000-4000-8000-000000000001','2026-08-06T03:00:00Z') value;
select is((select value->>'outcome' from first_request),'new','owner manual request creates a new logical sync');
select is((select value->>'sync_run_status' from first_request),'queued','new logical sync starts queued');
select is((select value->>'dispatch_status' from first_request),'pending','new logical sync has pending dispatch');
select is((select count(*)::text from public.sync_runs where project_id='a7730000-0000-4000-8000-000000000001'),'1','one SyncRun created');
select is((select count(*)::text from public.project_sync_dispatches where project_id='a7730000-0000-4000-8000-000000000001'),'1','one dispatch fact created');
select results_eq(
  $$select trigger_source,idempotency_key from public.sync_runs where project_id='a7730000-0000-4000-8000-000000000001'$$,
  $$values ('manual'::text,'sync-request:manual:request-001'::text)$$,
  'SyncRun preserves trigger and stable request lineage'
);
select results_eq(
  $$select trigger_source,request_identity from public.project_sync_dispatches where project_id='a7730000-0000-4000-8000-000000000001'$$,
  $$values ('manual'::text,'manual:request-001'::text)$$,
  'dispatch fact preserves trigger and request lineage'
);

select is(
  public.request_project_sync('a7730000-0000-4000-8000-000000000001','manual','manual:request-001','a7700000-0000-4000-8000-000000000001','2026-08-06T03:00:01Z')->>'outcome',
  'duplicate',
  'same manual identity is a duplicate'
);
select is(
  public.request_project_sync('a7730000-0000-4000-8000-000000000001','reconciliation','reconciliation:2026-08-06',null,'2026-08-06T03:00:02Z')->>'outcome',
  'coalesced',
  'reconciliation coalesces into the active manual run'
);
select is((select count(*)::text from public.sync_runs where project_id='a7730000-0000-4000-8000-000000000001'),'1','coalescing keeps one SyncRun');

insert into public.sync_runs(
  project_id,idempotency_key,trigger_source,status,queued_at,started_at,created_at,updated_at
) values (
  'b7730000-0000-4000-8000-000000000004','historical-partial','reconciliation','partial',
  '2026-08-05T00:00:00Z','2026-08-05T00:00:01Z','2026-08-05T00:00:00Z','2026-08-05T00:00:01Z'
);
select is(
  public.request_project_sync('b7730000-0000-4000-8000-000000000004','manual','manual:request-001','b7700000-0000-4000-8000-000000000002','2026-08-06T03:00:02Z')->>'outcome',
  'new',
  'another Project may use the same request identity and a partial history permits a new run'
);
select is((select count(*)::text from public.sync_runs where project_id='b7730000-0000-4000-8000-000000000004'),'2','new run preserves the historical partial run');
select is((select count(*)::text from public.sync_runs where project_id='b7730000-0000-4000-8000-000000000004' and status='partial'),'1','partial history is not overwritten');
select is((select count(*)::text from public.project_sync_dispatches where project_id='b7730000-0000-4000-8000-000000000004'),'1','cross-Project request identity creates one isolated dispatch fact');

create temporary table claimed as
select public.claim_project_sync_dispatch(
  'a7730000-0000-4000-8000-000000000001',
  ((select value->>'sync_run_id' from first_request)::uuid),
  1,
  '2026-08-06T03:00:03Z'
) value;
select is((select value->>'claimed' from claimed),'true','first dispatcher claims lease');
select is(
  public.claim_project_sync_dispatch(
    'a7730000-0000-4000-8000-000000000001',
    ((select value->>'sync_run_id' from first_request)::uuid),
    2,
    '2026-08-06T03:00:04Z'
  )->>'claimed',
  'false',
  'concurrent dispatcher cannot claim live lease'
);
select is(
  public.claim_project_sync_dispatch(
    'a7730000-0000-4000-8000-000000000001',
    ((select value->>'sync_run_id' from first_request)::uuid),
    2,
    '2026-08-06T03:01:04Z'
  )->>'claimed',
  'true',
  'expired crash window is reclaimed'
);
select lives_ok(
  format(
    'select public.complete_project_sync_dispatch(%L,%L,3,%L,%L)',
    'a7730000-0000-4000-8000-000000000001',
    (select value->>'sync_run_id' from first_request),
    'provider-phase7-001',
    '2026-08-06T03:01:05Z'
  ),
  'dispatch receipt completes safely'
);
select results_eq(
  $$select dispatch_status,provider_job_id,version from public.project_sync_dispatches where project_id='a7730000-0000-4000-8000-000000000001'$$,
  $$values ('dispatched'::text,'provider-phase7-001'::text,4::bigint)$$,
  'completed dispatch stores one safe receipt'
);

select is(
  public.request_project_sync('a7730000-0000-4000-8000-000000000002','manual','manual:suspended','a7700000-0000-4000-8000-000000000001','2026-08-06T03:02:00Z')->>'outcome',
  'suspended',
  'suspended installation blocks before SyncRun'
);
select is(
  public.request_project_sync('a7730000-0000-4000-8000-000000000003','reconciliation','reconciliation:2026-08-06',null,'2026-08-06T03:02:00Z')->>'outcome',
  'authorization_revoked',
  'revoked installation blocks before SyncRun'
);
select is((select count(*)::text from public.sync_runs where project_id in ('a7730000-0000-4000-8000-000000000002','a7730000-0000-4000-8000-000000000003')),'0','blocked installations create no SyncRun');

select throws_ok(
  $$select public.request_project_sync('a7730000-0000-4000-8000-000000000001','browser','bad identity',null,'2026-08-06T03:03:00Z')$$,
  'P0001','sync_request_invalid','invalid source and identity are rejected'
);

select ok(not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='project_sync_dispatches'
    and column_name in ('raw_payload','raw_response','source','diff','secret','token','authorization','signature','cookie')
),'dispatch inbox stores no raw or sensitive fields');

select * from finish();
rollback;
