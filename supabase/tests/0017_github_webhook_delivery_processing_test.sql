begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public', 'github_webhook_deliveries', 'sync_run_id', 'ordinary delivery stores trusted SyncRun lineage');
select has_column('public', 'github_webhook_deliveries', 'processing_lease_until', 'ordinary delivery stores processing lease');
select ok(exists(
  select 1 from pg_constraint
  where conname='github_webhook_deliveries_sync_run_fkey'
    and contype='f'
    and conrelid='public.github_webhook_deliveries'::regclass
),'delivery SyncRun foreign key exists');
select has_index('public', 'github_webhook_deliveries', 'github_webhook_deliveries_processing_recovery_idx', 'processing recovery index exists');
select has_function('public', 'claim_github_webhook_processing', array['uuid','uuid','bigint','timestamp with time zone'], 'processing claim RPC exists');
select has_function('public', 'complete_github_webhook_processing', array['uuid','uuid','bigint','timestamp with time zone'], 'processing completion RPC exists');
select has_function('public', 'fail_github_webhook_processing', array['uuid','uuid','bigint','text','timestamp with time zone'], 'processing failure RPC exists');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname='github_webhook_deliveries_status_check') like '%processing%'
  and (select pg_get_constraintdef(oid) from pg_constraint where conname='github_webhook_deliveries_status_check') like '%failed%',
  'delivery status constraint includes processing and failed'
);
select ok((select relrowsecurity from pg_class where oid='public.github_webhook_deliveries'::regclass), 'delivery RLS remains enabled');
select ok(
  not exists(
    select 1 from pg_class target, lateral aclexplode(target.relacl) privilege
    where target.oid='public.github_webhook_deliveries'::regclass
      and privilege.grantee=0
      and privilege.privilege_type in ('INSERT','UPDATE','DELETE')
  )
  and not has_table_privilege('anon','public.github_webhook_deliveries','insert,update,delete')
  and not has_table_privilege('authenticated','public.github_webhook_deliveries','insert,update,delete')
  and not has_table_privilege('service_role','public.github_webhook_deliveries','insert,update,delete'),
  'all roles retain zero direct delivery writes'
);
select ok(
  has_function_privilege('service_role','public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz)','execute')
  and not exists(
    select 1 from pg_proc target, lateral aclexplode(target.proacl) privilege
    where target.oid='public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz)'::regprocedure
      and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
  )
  and not has_function_privilege('anon','public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.claim_github_webhook_processing(uuid,uuid,bigint,timestamptz)','execute'),
  'processing claim is service-role only'
);
select ok(
  has_function_privilege('service_role','public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz)','execute')
  and not exists(
    select 1 from pg_proc target, lateral aclexplode(target.proacl) privilege
    where target.oid='public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz)'::regprocedure
      and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
  )
  and not has_function_privilege('anon','public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.complete_github_webhook_processing(uuid,uuid,bigint,timestamptz)','execute'),
  'processing completion is service-role only'
);
select ok(
  has_function_privilege('service_role','public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz)','execute')
  and not exists(
    select 1 from pg_proc target, lateral aclexplode(target.proacl) privilege
    where target.oid='public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz)'::regprocedure
      and privilege.grantee=0 and privilege.privilege_type='EXECUTE'
  )
  and not has_function_privilege('anon','public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.fail_github_webhook_processing(uuid,uuid,bigint,text,timestamptz)','execute'),
  'processing failure is service-role only'
);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('a7800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9-1-2-a@example.test','',now(),'{}','{}',now(),now()),
('b7800000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase9-1-2-b@example.test','',now(),'{}','{}',now(),now());
insert into public.users(id) values
('a7800000-0000-4000-8000-000000000001'),
('b7800000-0000-4000-8000-000000000002');
insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at) values
('a7810000-0000-4000-8000-000000000001','a7800000-0000-4000-8000-000000000001',88101,78101,'phase912-a','User','selected','active',now()),
('b7810000-0000-4000-8000-000000000002','b7800000-0000-4000-8000-000000000002',88102,78102,'phase912-b','User','selected','active',now());
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch) values
('a7820000-0000-4000-8000-000000000001','a7800000-0000-4000-8000-000000000001','a7810000-0000-4000-8000-000000000001',98101,'owner-a','repo-a','owner-a/repo-a','private',true,false,false,false,'main'),
('b7820000-0000-4000-8000-000000000002','b7800000-0000-4000-8000-000000000002','b7810000-0000-4000-8000-000000000002',98102,'owner-b','repo-b','owner-b/repo-b','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status) values
('a7830000-0000-4000-8000-000000000001','a7800000-0000-4000-8000-000000000001','a7820000-0000-4000-8000-000000000001','phase 9.1.2 a','delivery terminal','in_development'),
('b7830000-0000-4000-8000-000000000002','b7800000-0000-4000-8000-000000000002','b7820000-0000-4000-8000-000000000002','phase 9.1.2 b','delivery isolation','in_development');

insert into public.sync_runs(id,project_id,idempotency_key,trigger_source,status,queued_at,started_at,finished_at,created_at,updated_at) values
('a7840000-0000-4000-8000-000000000001','a7830000-0000-4000-8000-000000000001','webhook-completed','webhook','completed','2026-08-07T00:00:00Z','2026-08-07T00:00:01Z','2026-08-07T00:00:02Z','2026-08-07T00:00:00Z','2026-08-07T00:00:02Z'),
('a7840000-0000-4000-8000-000000000002','a7830000-0000-4000-8000-000000000001','webhook-running','webhook','running','2026-08-07T00:10:00Z','2026-08-07T00:10:01Z',null,'2026-08-07T00:10:00Z','2026-08-07T00:10:01Z'),
('a7840000-0000-4000-8000-000000000003','a7830000-0000-4000-8000-000000000001','webhook-partial','webhook','partial','2026-08-07T00:20:00Z','2026-08-07T00:20:01Z',null,'2026-08-07T00:20:00Z','2026-08-07T00:20:01Z'),
('a7840000-0000-4000-8000-000000000004','a7830000-0000-4000-8000-000000000001','first-sync-completed','first_sync','completed','2026-08-07T00:30:00Z','2026-08-07T00:30:01Z','2026-08-07T00:30:02Z','2026-08-07T00:30:00Z','2026-08-07T00:30:02Z'),
('a7840000-0000-4000-8000-000000000005','a7830000-0000-4000-8000-000000000001','reconciliation-completed','reconciliation','completed','2026-08-07T00:40:00Z','2026-08-07T00:40:01Z','2026-08-07T00:40:02Z','2026-08-07T00:40:00Z','2026-08-07T00:40:02Z'),
('a7840000-0000-4000-8000-000000000006','a7830000-0000-4000-8000-000000000001','manual-completed','manual','completed','2026-08-07T00:50:00Z','2026-08-07T00:50:01Z','2026-08-07T00:50:02Z','2026-08-07T00:50:00Z','2026-08-07T00:50:02Z'),
('b7840000-0000-4000-8000-000000000001','b7830000-0000-4000-8000-000000000002','webhook-cross-project','webhook','completed','2026-08-07T01:00:00Z','2026-08-07T01:00:01Z','2026-08-07T01:00:02Z','2026-08-07T01:00:00Z','2026-08-07T01:00:02Z');

-- Delivery one: successful processing retains provider lineage and duplicate completion is a no-op.
select public.register_github_webhook_delivery('81111111-1111-4111-8111-111111111111','1111111111111111111111111111111111111111111111111111111111111111','issues','opened',88101,98101,'owner-a/repo-a','github-webhook:81111111-1111-4111-8111-111111111111',true,'2026-08-07T02:00:00Z');
select public.claim_github_webhook_dispatch('81111111-1111-4111-8111-111111111111',1,'2026-08-07T02:00:01Z');
select public.complete_github_webhook_dispatch('81111111-1111-4111-8111-111111111111',2,'provider-phase912-success','2026-08-07T02:00:02Z');
select is(
  public.claim_github_webhook_processing('81111111-1111-4111-8111-111111111111','a7840000-0000-4000-8000-000000000001',3,'2026-08-07T02:00:03Z')->>'claimed',
  'true',
  'ordinary dispatched delivery binds and claims same-Project webhook SyncRun'
);
select results_eq(
  $$select status,sync_run_id,provider_receipt_id,version from public.github_webhook_deliveries where delivery_id='81111111-1111-4111-8111-111111111111'$$,
  $$values ('processing'::text,'a7840000-0000-4000-8000-000000000001'::uuid,'provider-phase912-success'::text,4::bigint)$$,
  'processing retains provider receipt and trusted SyncRun lineage'
);
select is(
  public.complete_github_webhook_processing('81111111-1111-4111-8111-111111111111','a7840000-0000-4000-8000-000000000001',4,'2026-08-07T02:00:04Z')->>'outcome',
  'completed',
  'successful terminal SyncRun completes ordinary delivery'
);
select results_eq(
  $$select status,sync_run_id,provider_receipt_id,safe_error_code,version from public.github_webhook_deliveries where delivery_id='81111111-1111-4111-8111-111111111111'$$,
  $$values ('completed'::text,'a7840000-0000-4000-8000-000000000001'::uuid,'provider-phase912-success'::text,null::text,5::bigint)$$,
  'completed delivery retains provider receipt and clears no lineage'
);
select is(
  public.complete_github_webhook_processing('81111111-1111-4111-8111-111111111111','a7840000-0000-4000-8000-000000000001',4,'2026-08-07T02:00:05Z')->>'outcome',
  'duplicate',
  'repeated completion is stable no-op even with prior expected version'
);
select results_eq(
  $$select provider_receipt_id,version from public.github_webhook_deliveries where delivery_id='81111111-1111-4111-8111-111111111111'$$,
  $$values ('provider-phase912-success'::text,5::bigint)$$,
  'duplicate completion changes neither receipt nor version'
);
select throws_ok(
  $$select public.complete_github_webhook_processing('81111111-1111-4111-8111-111111111111','a7840000-0000-4000-8000-000000000003',5,'2026-08-07T02:00:06Z')$$,
  'P0001','github_webhook_processing_invalid_sync_run','completed delivery rejects another SyncRun'
);

-- Delivery two: active lease, non-terminal run, failure, retry and eventual completion.
select public.register_github_webhook_delivery('82222222-2222-4222-8222-222222222222','2222222222222222222222222222222222222222222222222222222222222222','pull_request','opened',88101,98101,'owner-a/repo-a','github-webhook:82222222-2222-4222-8222-222222222222',true,'2026-08-07T03:00:00Z');
select public.claim_github_webhook_dispatch('82222222-2222-4222-8222-222222222222',1,'2026-08-07T03:00:01Z');
select public.complete_github_webhook_dispatch('82222222-2222-4222-8222-222222222222',2,'provider-phase912-retry','2026-08-07T03:00:02Z');
select is(public.claim_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',3,'2026-08-07T03:00:03Z')->>'claimed','true','retry case claims processing');
select is(public.claim_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',4,'2026-08-07T03:00:04Z')->>'claimed','false','active processing lease prevents concurrent claim');
select throws_ok(
  $$select public.complete_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',4,'2026-08-07T03:00:05Z')$$,
  'P0001','github_webhook_processing_sync_run_not_terminal','running SyncRun cannot complete delivery'
);
select is(public.claim_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',4,'2026-08-07T03:05:04Z')->>'claimed','true','expired processing lease is reclaimed');
select throws_ok(
  $$select public.fail_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',4,null,'2026-08-07T03:05:05Z')$$,
  'P0001','github_webhook_processing_error_code_invalid','null failure code is rejected with the stable safe-error contract'
);
select throws_ok(
  $$select public.fail_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',4,'provider_raw_body','2026-08-07T03:05:05Z')$$,
  'P0001','github_webhook_processing_error_code_invalid','arbitrary failure text is rejected before mutation'
);
select throws_ok(
  $$select public.fail_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',4,'github_activity_timeout','2026-08-07T03:05:05Z')$$,
  'P0001','github_webhook_processing_concurrency_conflict','stale failure version is rejected'
);
select is(
  public.fail_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',5,'github_activity_timeout','2026-08-07T03:05:05Z')->>'outcome',
  'failed',
  'safe retryable failure is durably recorded'
);
select results_eq(
  $$select status,sync_run_id,provider_receipt_id,safe_error_code,version from public.github_webhook_deliveries where delivery_id='82222222-2222-4222-8222-222222222222'$$,
  $$values ('failed'::text,'a7840000-0000-4000-8000-000000000002'::uuid,'provider-phase912-retry'::text,'github_activity_timeout'::text,6::bigint)$$,
  'failed state stores only safe code and preserves lineage'
);
select is(public.claim_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',6,'2026-08-07T03:05:06Z')->>'claimed','true','failed delivery reclaims with same identity');
update public.sync_runs set status='partial',updated_at='2026-08-07T03:05:07Z' where id='a7840000-0000-4000-8000-000000000002';
select is(public.complete_github_webhook_processing('82222222-2222-4222-8222-222222222222','a7840000-0000-4000-8000-000000000002',7,'2026-08-07T03:05:08Z')->>'outcome','completed','partial SyncRun permits eventual delivery completion');
select results_eq(
  $$select status,sync_run_id,provider_receipt_id,safe_error_code,version from public.github_webhook_deliveries where delivery_id='82222222-2222-4222-8222-222222222222'$$,
  $$values ('completed'::text,'a7840000-0000-4000-8000-000000000002'::uuid,'provider-phase912-retry'::text,null::text,8::bigint)$$,
  'retry completes one delivery without replacing receipt or SyncRun'
);

-- A fresh dispatched delivery rejects cross-Project and non-webhook SyncRuns without mutation.
select public.register_github_webhook_delivery('83333333-3333-4333-8333-333333333333','3333333333333333333333333333333333333333333333333333333333333333','release','published',88101,98101,'owner-a/repo-a','github-webhook:83333333-3333-4333-8333-333333333333',true,'2026-08-07T04:00:00Z');
select public.claim_github_webhook_dispatch('83333333-3333-4333-8333-333333333333',1,'2026-08-07T04:00:01Z');
select public.complete_github_webhook_dispatch('83333333-3333-4333-8333-333333333333',2,'provider-phase912-isolation','2026-08-07T04:00:02Z');
select throws_ok($$select public.claim_github_webhook_processing('83333333-3333-4333-8333-333333333333','b7840000-0000-4000-8000-000000000001',3,'2026-08-07T04:00:03Z')$$,'P0001','github_webhook_processing_invalid_sync_run','cross-Project SyncRun is rejected');
select throws_ok($$select public.claim_github_webhook_processing('83333333-3333-4333-8333-333333333333','a7840000-0000-4000-8000-000000000004',3,'2026-08-07T04:00:03Z')$$,'P0001','github_webhook_processing_invalid_sync_run','first_sync run is rejected');
select throws_ok($$select public.claim_github_webhook_processing('83333333-3333-4333-8333-333333333333','a7840000-0000-4000-8000-000000000005',3,'2026-08-07T04:00:03Z')$$,'P0001','github_webhook_processing_invalid_sync_run','reconciliation run is rejected');
select throws_ok($$select public.claim_github_webhook_processing('83333333-3333-4333-8333-333333333333','a7840000-0000-4000-8000-000000000006',3,'2026-08-07T04:00:03Z')$$,'P0001','github_webhook_processing_invalid_sync_run','manual run is rejected');
select results_eq(
  $$select status,sync_run_id,provider_receipt_id,version from public.github_webhook_deliveries where delivery_id='83333333-3333-4333-8333-333333333333'$$,
  $$values ('dispatched'::text,null::uuid,'provider-phase912-isolation'::text,3::bigint)$$,
  'invalid bindings leave ordinary delivery unchanged'
);

-- Installation, ignored, pending and dispatching deliveries cannot enter ordinary processing.
select public.register_github_webhook_delivery('84444444-4444-4444-8444-444444444444','4444444444444444444444444444444444444444444444444444444444444444','installation','deleted',88101,null,null,'github-webhook:84444444-4444-4444-8444-444444444444',true,'2026-08-07T05:00:00Z');
select public.register_github_webhook_delivery('85555555-5555-4555-8555-555555555555','5555555555555555555555555555555555555555555555555555555555555555','issues','assigned',88101,98101,'owner-a/repo-a','github-webhook:85555555-5555-4555-8555-555555555555',false,'2026-08-07T05:00:00Z');
select public.register_github_webhook_delivery('86666666-6666-4666-8666-666666666666','6666666666666666666666666666666666666666666666666666666666666666','issues','opened',88101,98101,'owner-a/repo-a','github-webhook:86666666-6666-4666-8666-666666666666',true,'2026-08-07T05:00:00Z');
select public.register_github_webhook_delivery('87777777-7777-4777-8777-777777777777','7777777777777777777777777777777777777777777777777777777777777777','issues','opened',88101,98101,'owner-a/repo-a','github-webhook:87777777-7777-4777-8777-777777777777',true,'2026-08-07T05:00:00Z');
select public.claim_github_webhook_dispatch('87777777-7777-4777-8777-777777777777',1,'2026-08-07T05:00:01Z');
select is(public.claim_github_webhook_processing('84444444-4444-4444-8444-444444444444','a7840000-0000-4000-8000-000000000001',1,'2026-08-07T05:00:02Z')->>'claimed','false','installation delivery is never claimed by ordinary processing');
select is(public.claim_github_webhook_processing('85555555-5555-4555-8555-555555555555','a7840000-0000-4000-8000-000000000001',1,'2026-08-07T05:00:02Z')->>'claimed','false','ignored delivery is never claimed by ordinary processing');
select is(public.claim_github_webhook_processing('86666666-6666-4666-8666-666666666666','a7840000-0000-4000-8000-000000000001',1,'2026-08-07T05:00:02Z')->>'claimed','false','pending delivery is never claimed by ordinary processing');
select is(public.claim_github_webhook_processing('87777777-7777-4777-8777-777777777777','a7840000-0000-4000-8000-000000000001',2,'2026-08-07T05:00:02Z')->>'claimed','false','dispatching delivery is never claimed by ordinary processing');

select ok(not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='github_webhook_deliveries'
    and column_name in ('raw_payload','raw_body','signature','secret','token','authorization','cookie','error_message','error_cause')
),'processing extension stores no raw or sensitive fields');

select * from finish();
rollback;
