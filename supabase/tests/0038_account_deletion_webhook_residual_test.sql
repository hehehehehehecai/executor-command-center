begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Phase 3.1 independent residual fixture.
-- target user / installation / project: c100...001 / c110...001 / c130...001
-- control user / installation / project: c100...002 / c110...002 / c130...002
insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('c1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase31-target@example.test','',now(),'{}','{}',now(),now()),
  ('c1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase31-control@example.test','',now(),'{}','{}',now(),now());
insert into public.users(id) values
  ('c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002');
insert into public.github_installations(
  id,user_id,installation_id,github_account_id,github_account_login,
  account_type,repository_selection,status,last_verified_at
) values
  ('c1100000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',931001,931001,'phase31-target','User','selected','active',now()),
  ('c1100000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002',931002,931002,'phase31-control','User','selected','active',now());
insert into public.selected_repositories(
  id,user_id,github_installation_id,github_repository_id,owner_login,name,
  full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch
) values
  ('c1200000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001',931101,'synthetic','phase31-target','synthetic/phase31-target','private',true,false,false,false,'main'),
  ('c1200000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','c1100000-0000-4000-8000-000000000002',931102,'synthetic','phase31-control','synthetic/phase31-control','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status) values
  ('c1300000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','Phase 3.1 target','Remove webhook lineage','in_development'),
  ('c1300000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','c1200000-0000-4000-8000-000000000002','Phase 3.1 control','Remain unchanged','in_development');

insert into public.github_webhook_deliveries(
  id,delivery_id,body_sha256,event_name,action,installation_id,repository_id,
  repository_full_name,project_id,internal_event_id,status,received_at
) values
  ('c1400000-0000-4000-8000-000000000001','c1410000-0000-4000-8000-000000000001',repeat('a',64),'issues','opened',931001,931101,'synthetic/phase31-target','c1300000-0000-4000-8000-000000000001','github-webhook:c1410000-0000-4000-8000-000000000001','ignored',now()),
  ('c1400000-0000-4000-8000-000000000002','c1410000-0000-4000-8000-000000000002',repeat('b',64),'installation','deleted',931001,null,null,null,'github-webhook:c1410000-0000-4000-8000-000000000002','ignored',now()),
  ('c1400000-0000-4000-8000-000000000003','c1410000-0000-4000-8000-000000000003',repeat('c',64),'issues','opened',931002,931102,'synthetic/phase31-control','c1300000-0000-4000-8000-000000000002','github-webhook:c1410000-0000-4000-8000-000000000003','ignored',now()),
  ('c1400000-0000-4000-8000-000000000004','c1410000-0000-4000-8000-000000000004',repeat('d',64),'installation','deleted',939999,null,null,null,'github-webhook:c1410000-0000-4000-8000-000000000004','ignored',now());

create temporary table phase31_residual_operation as
select public.request_account_deletion(
  'c1000000-0000-4000-8000-000000000001','phase31:residual:request',
  'DELETE ACCOUNT c1000000-0000-4000-8000-000000000001'
) result;
update public.account_deletion_operations operation set operation_id='c1800000-0000-4000-8000-000000000001'
where operation.operation_id=(select (result->>'operationId')::uuid from phase31_residual_operation);
update phase31_residual_operation set result=jsonb_set(
  result,'{operationId}',to_jsonb('c1800000-0000-4000-8000-000000000001'::text)
);
update public.account_deletion_operations operation set
  due_at=fixture_time.value,requested_at=fixture_time.value-interval '7 days'
from (select clock_timestamp()-interval '1 second' value) fixture_time
where operation.operation_id=(select (result->>'operationId')::uuid from phase31_residual_operation);
create temporary table phase31_residual_claim as
select public.claim_account_deletion(
  (select (result->>'operationId')::uuid from phase31_residual_operation),interval '5 minutes'
) result;
select is(
  public.cleanup_account_business_data(
    (select (result->>'operationId')::uuid from phase31_residual_operation),
    (select (result->>'leaseToken')::uuid from phase31_residual_claim)
  )->>'outcome','deleted','business cleanup completes for the synthetic target'
);

select is((select count(*) from public.github_webhook_deliveries where id in(
  'c1400000-0000-4000-8000-000000000001','c1400000-0000-4000-8000-000000000002'
)),0::bigint,'target ordinary and installation webhook lineage is removed before ownership FKs disappear');
select is((select count(*) from public.github_webhook_deliveries where installation_id=931001
  or project_id='c1300000-0000-4000-8000-000000000001'
  or repository_full_name='synthetic/phase31-target'
  or repository_id=931101
  or body_sha256 in(repeat('a',64),repeat('b',64))),0::bigint,
  'no target repository identifier or body digest remains');
select is((select count(*) from public.github_webhook_deliveries where id='c1400000-0000-4000-8000-000000000003'),1::bigint,
  'other-user webhook remains byte-for-byte addressable');
select is((select count(*) from public.github_webhook_deliveries where id='c1400000-0000-4000-8000-000000000004'),1::bigint,
  'genuinely unmapped installation event is preserved');
select results_eq(
  $$select installation_id,repository_id,repository_full_name,body_sha256,status from public.github_webhook_deliveries where id='c1400000-0000-4000-8000-000000000003'$$,
  $$values (931002::bigint,931102::bigint,'synthetic/phase31-control'::text,repeat('c',64)::text,'ignored'::text)$$,
  'control webhook business metadata is unchanged'
);

select * from finish();
rollback;
