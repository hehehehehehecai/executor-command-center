create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

-- Phase 3.1 independent retry-exhausted fixture.
-- operation lineage is aligned by user + operation_id + generation + dispatch token.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('c3000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase31-recovery@example.test','',now(),'{}','{}',now(),now()),
  ('c3000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase31-recovery-control@example.test','',now(),'{}','{}',now(),now());
insert into public.users(id) values
  ('c3000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-000000000002');

create temporary table phase31_recovery_operation as
select public.request_account_deletion(
  'c3000000-0000-4000-8000-000000000001','phase31:recovery:request',
  'DELETE ACCOUNT c3000000-0000-4000-8000-000000000001'
) result;
update public.account_deletion_operations operation set operation_id='c3800000-0000-4000-8000-000000000001'
where operation.operation_id=(select (result->>'operationId')::uuid from phase31_recovery_operation);
update phase31_recovery_operation set result=jsonb_set(
  result,'{operationId}',to_jsonb('c3800000-0000-4000-8000-000000000001'::text)
);
update public.account_deletion_operations operation set
  due_at=fixture_time.value,requested_at=fixture_time.value-interval '7 days'
from (select clock_timestamp()-interval '1 second' value) fixture_time
where operation.operation_id=(select (result->>'operationId')::uuid from phase31_recovery_operation);
create temporary table phase31_recovery_initial_claim as
select public.claim_account_deletion(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),interval '5 minutes'
) result;
select public.cleanup_account_business_data(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),
  (select (result->>'leaseToken')::uuid from phase31_recovery_initial_claim)
);
select is(public.complete_account_deletion(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),
  (select (result->>'leaseToken')::uuid from phase31_recovery_initial_claim),
  'auth_failed',null,'account_deletion_auth_identity_delete_failed'
)->>'status','deletion_failed','partial Auth failure remains retryable before worker exhaustion');

select is(public.mark_account_deletion_retry_exhausted(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),0
)->>'outcome','retry_exhausted','finite worker exhaustion creates a durable recovery marker');
select results_eq(
  $$select recovery_generation,retry_exhausted_count,(recovery_eligible_at is not null),status from public.account_deletion_operations where user_id='c3000000-0000-4000-8000-000000000001'$$,
  $$values (1,1,true,'deletion_failed'::text)$$,
  'exhaustion advances exactly one generation without claiming deletion success'
);
select is(public.mark_account_deletion_retry_exhausted(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),0
)->>'outcome','replayed','same exhausted generation is idempotent');
select is((select recovery_generation from public.account_deletion_operations where user_id='c3000000-0000-4000-8000-000000000001'),1,
  'exhaustion replay creates no extra generation');

create function app_private.test_phase31_recovery_connect(p_name text)
returns text language sql security definer set search_path=''
as $$select extensions.dblink_connect(p_name,'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres')$$;
select app_private.test_phase31_recovery_connect('phase31_recovery_a');
select app_private.test_phase31_recovery_connect('phase31_recovery_b');
select extensions.dblink_exec('phase31_recovery_a','begin');
create temporary table phase31_recovery_dispatch_claim as
select result from extensions.dblink('phase31_recovery_a',
  $$select public.claim_account_deletion_recoveries(1,interval '2 minutes')$$
) r(result jsonb);
select is(jsonb_array_length((select result->'operations' from phase31_recovery_dispatch_claim)),1,
  'first recovery scanner claims the one eligible operation');
select is((select jsonb_array_length(result->'operations') from extensions.dblink('phase31_recovery_b',
  $$select public.claim_account_deletion_recoveries(1,interval '2 minutes')$$
) r(result jsonb)),0,'concurrent scanner skips the leased row and has no second winner');
select extensions.dblink_exec('phase31_recovery_a','commit');

select is(public.complete_account_deletion_recovery_dispatch(
  (select (item->>'operationId')::uuid from phase31_recovery_dispatch_claim, lateral jsonb_array_elements(result->'operations') item),
  (select (item->>'generation')::integer from phase31_recovery_dispatch_claim, lateral jsonb_array_elements(result->'operations') item),
  (select (item->>'dispatchToken')::uuid from phase31_recovery_dispatch_claim, lateral jsonb_array_elements(result->'operations') item),
  'dispatch_failed','account_deletion_recovery_dispatch_failed'
)->>'outcome','retry_scheduled','dispatch failure is not confused with deletion success');
select ok((select recovery_eligible_at>clock_timestamp() from public.account_deletion_operations where user_id='c3000000-0000-4000-8000-000000000001'),
  'dispatch failure remains durably eligible after database-authoritative backoff');

update public.account_deletion_operations set recovery_eligible_at=clock_timestamp()-interval '1 second'
where user_id='c3000000-0000-4000-8000-000000000001';
create temporary table phase31_recovery_retry_dispatch as
select public.claim_account_deletion_recoveries(1,interval '2 minutes') result;
select is(public.complete_account_deletion_recovery_dispatch(
  (select (item->>'operationId')::uuid from phase31_recovery_retry_dispatch, lateral jsonb_array_elements(result->'operations') item),
  (select (item->>'generation')::integer from phase31_recovery_retry_dispatch, lateral jsonb_array_elements(result->'operations') item),
  (select (item->>'dispatchToken')::uuid from phase31_recovery_retry_dispatch, lateral jsonb_array_elements(result->'operations') item),
  'dispatched',null
)->>'outcome','dispatched','later scanner can safely dispatch the same recovery generation');

create temporary table phase31_recovery_worker_claim as
select public.claim_account_deletion(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),interval '5 minutes'
) result;
select is((select result->>'outcome' from phase31_recovery_worker_claim),'claimed','recovery job reclaims the failed operation');
select is(public.cleanup_account_business_data(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),
  (select (result->>'leaseToken')::uuid from phase31_recovery_worker_claim)
)->>'outcome','already_absent','recovery does not repeat business deletion');
select is(public.complete_account_deletion(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),
  (select (result->>'leaseToken')::uuid from phase31_recovery_worker_claim),
  'auth_already_absent',repeat('f',64),null
)->>'status','deleted','recovery converges Auth-already-absent to deleted');
select is(public.mark_account_deletion_retry_exhausted(
  (select (result->>'operationId')::uuid from phase31_recovery_operation),1
)->>'outcome','completed','old failure callback after deleted is a no-op');
select is(jsonb_array_length(public.claim_account_deletion_recoveries(10,interval '2 minutes')->'operations'),0,
  'deleted tombstone never becomes recovery eligible again');
select results_eq(
  $$select status,recovery_generation,retry_exhausted_count,recovery_eligible_at,recovery_dispatch_token from public.account_deletion_operations where user_id='c3000000-0000-4000-8000-000000000001'$$,
  $$values ('deleted'::text,1,1,null::timestamptz,null::uuid)$$,
  'completed tombstone retains only low-cardinality audit counters and no active lease');
select is((select status from public.account_deletion_operations where user_id='c3000000-0000-4000-8000-000000000002'),'active',
  'control account lifecycle remains unchanged');

select extensions.dblink_disconnect('phase31_recovery_a');
select extensions.dblink_disconnect('phase31_recovery_b');
drop function app_private.test_phase31_recovery_connect(text);
select * from finish();

delete from auth.users where id in(
  'c3000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000002'
);
delete from public.account_deletion_operations where user_id in(
  'c3000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000002'
);
