create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

-- Phase 3.2 independent fixtures. Every assertion aligns by stable user,
-- operation, generation and dispatch token rather than execution order.
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('c4000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase32-due@example.test','',now(),'{}','{}',now(),now()),
  ('c4000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase32-not-due@example.test','',now(),'{}','{}',now(),now()),
  ('c4000000-0000-4000-8000-000000000003','00000000-0000-0000-8000-000000000000','authenticated','authenticated','phase32-cancel@example.test','',now(),'{}','{}',now(),now()),
  ('c4000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase32-control@example.test','',now(),'{}','{}',now(),now());
insert into public.users(id) values
  ('c4000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000002'),
  ('c4000000-0000-4000-8000-000000000003'),
  ('c4000000-0000-4000-8000-000000000004');

create temporary table phase32_due_request as
select public.request_account_deletion(
  'c4000000-0000-4000-8000-000000000001','phase32:due:request',
  'DELETE ACCOUNT c4000000-0000-4000-8000-000000000001'
) result;
update public.account_deletion_operations operation
set operation_id='c4800000-0000-4000-8000-000000000001',
  due_at=fixture.value,
  requested_at=fixture.value-interval '7 days'
from (select clock_timestamp()-interval '1 second' value) fixture
where user_id='c4000000-0000-4000-8000-000000000001';
update phase32_due_request set result=jsonb_set(
  result,'{operationId}',to_jsonb('c4800000-0000-4000-8000-000000000001'::text)
);

create temporary table phase32_not_due_request as
select public.request_account_deletion(
  'c4000000-0000-4000-8000-000000000002','phase32:not-due:request',
  'DELETE ACCOUNT c4000000-0000-4000-8000-000000000002'
) result;
update public.account_deletion_operations operation
set operation_id='c4800000-0000-4000-8000-000000000002',
  requested_at=fixture.value,
  due_at=fixture.value+interval '7 days'
from (select clock_timestamp() value) fixture
where user_id='c4000000-0000-4000-8000-000000000002';

create temporary table phase32_cancel_request as
select public.request_account_deletion(
  'c4000000-0000-4000-8000-000000000003','phase32:cancel:request',
  'DELETE ACCOUNT c4000000-0000-4000-8000-000000000003'
) result;
update public.account_deletion_operations operation
set operation_id='c4800000-0000-4000-8000-000000000003',
  requested_at=fixture.value,
  due_at=fixture.value+interval '7 days'
from (select clock_timestamp() value) fixture
where user_id='c4000000-0000-4000-8000-000000000003';

select is(public.mark_account_deletion_retry_exhausted(
  'c4800000-0000-4000-8000-000000000001',0
)->>'outcome','retry_exhausted','claim-preceding exhaustion creates a durable marker for due pending work');
select results_eq(
  $$select status,recovery_generation,retry_exhausted_count,(recovery_eligible_at<=clock_timestamp()) from public.account_deletion_operations where operation_id='c4800000-0000-4000-8000-000000000001'$$,
  $$values ('deletion_pending'::text,1,1,true)$$,
  'marker preserves the pending state and advances exactly one recovery generation'
);
select is(public.mark_account_deletion_retry_exhausted(
  'c4800000-0000-4000-8000-000000000001',0
)->>'outcome','replayed','same pending exhaustion generation is idempotent');
select is((select recovery_generation from public.account_deletion_operations where operation_id='c4800000-0000-4000-8000-000000000001'),1,
  'marker replay does not advance generation twice');

select is(public.mark_account_deletion_retry_exhausted(
  'c4800000-0000-4000-8000-000000000002',0
)->>'outcome','retry_exhausted','not-due pending may retain a marker without becoming executable');
select ok((select recovery_eligible_at>=due_at from public.account_deletion_operations where operation_id='c4800000-0000-4000-8000-000000000002'),
  'database due time bounds not-due recovery eligibility');

select is(public.mark_account_deletion_retry_exhausted(
  'c4800000-0000-4000-8000-000000000003',0
)->>'outcome','retry_exhausted','cancel fixture receives an old recovery marker');
select is(public.cancel_account_deletion(
  'c4000000-0000-4000-8000-000000000003','c4800000-0000-4000-8000-000000000003'
)->>'outcome','cancelled','pending request remains cancellable inside the seven-day window');
select results_eq(
  $$select status,recovery_generation,recovery_eligible_at,recovery_dispatch_token,recovery_dispatch_lease_expires_at,recovery_dispatched_at,recovery_dispatch_attempts,recovery_last_error_code,retry_exhausted_at,retry_exhausted_count from public.account_deletion_operations where user_id='c4000000-0000-4000-8000-000000000003'$$,
  $$values ('active'::text,0,null::timestamptz,null::uuid,null::timestamptz,null::timestamptz,0,null::text,null::timestamptz,0)$$,
  'cancellation clears every marker lease generation counter and recovery error'
);

create temporary table phase32_new_request as
select public.request_account_deletion(
  'c4000000-0000-4000-8000-000000000003','phase32:cancel:new-request',
  'DELETE ACCOUNT c4000000-0000-4000-8000-000000000003'
) result;
select isnt((select result->>'operationId' from phase32_new_request),'c4800000-0000-4000-8000-000000000003',
  're-request creates a new operation identity');
select results_eq(
  $$select status,recovery_generation,recovery_eligible_at,recovery_dispatch_token,recovery_dispatch_attempts,retry_exhausted_count from public.account_deletion_operations where user_id='c4000000-0000-4000-8000-000000000003'$$,
  $$values ('deletion_pending'::text,0,null::timestamptz,null::uuid,0,0)$$,
  're-request begins with a clean generation zero recovery state'
);
select is(public.mark_account_deletion_retry_exhausted(
  'c4800000-0000-4000-8000-000000000003',1
)->>'outcome','completed','old onFailure callback is a stable no-op after re-request');
select is(public.claim_account_deletion(
  'c4800000-0000-4000-8000-000000000003',interval '5 minutes'
)->>'outcome','not_found','old recovery event is a stable no-op after re-request');
select results_eq(
  $$select operation_id,recovery_generation,retry_exhausted_count from public.account_deletion_operations where user_id='c4000000-0000-4000-8000-000000000003'$$,
  $$select (result->>'operationId')::uuid,0,0 from phase32_new_request$$,
  'old callback cannot mutate the new operation identity or generation'
);

create function app_private.test_phase32_recovery_connect(p_name text)
returns text language sql security definer set search_path=''
as $$select extensions.dblink_connect(p_name,'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres')$$;
select app_private.test_phase32_recovery_connect('phase32_recovery_a');
select app_private.test_phase32_recovery_connect('phase32_recovery_b');
select extensions.dblink_exec('phase32_recovery_a','begin');
create temporary table phase32_dispatch_claim as
select result from extensions.dblink('phase32_recovery_a',
  $$select public.claim_account_deletion_recoveries(10,interval '2 minutes')$$
) r(result jsonb);
select is(jsonb_array_length((select result->'operations' from phase32_dispatch_claim)),1,
  'scanner claims the due pending operation and not the not-due or re-request fixtures');
select is((select item->>'operationId' from phase32_dispatch_claim,lateral jsonb_array_elements(result->'operations') item),
  'c4800000-0000-4000-8000-000000000001','scanner aligns the due operation by stable identity');
select is((select jsonb_array_length(result->'operations') from extensions.dblink('phase32_recovery_b',
  $$select public.claim_account_deletion_recoveries(10,interval '2 minutes')$$
) r(result jsonb)),0,'concurrent scanner has no second winner');
select extensions.dblink_exec('phase32_recovery_a','commit');

select is(public.complete_account_deletion_recovery_dispatch(
  'c4800000-0000-4000-8000-000000000001',
  (select (item->>'generation')::integer from phase32_dispatch_claim,lateral jsonb_array_elements(result->'operations') item),
  (select (item->>'dispatchToken')::uuid from phase32_dispatch_claim,lateral jsonb_array_elements(result->'operations') item),
  'dispatch_failed','account_deletion_recovery_dispatch_failed'
)->>'outcome','retry_scheduled','failed recovery dispatch remains retryable without claiming deletion success');
update public.account_deletion_operations set recovery_eligible_at=clock_timestamp()-interval '1 second'
where operation_id='c4800000-0000-4000-8000-000000000001';
create temporary table phase32_dispatch_retry as
select public.claim_account_deletion_recoveries(10,interval '2 minutes') result;
select is(jsonb_array_length((select result->'operations' from phase32_dispatch_retry)),1,
  'dispatch failure is eligible for a bounded later scan');
select is(public.complete_account_deletion_recovery_dispatch(
  'c4800000-0000-4000-8000-000000000001',
  (select (item->>'generation')::integer from phase32_dispatch_retry,lateral jsonb_array_elements(result->'operations') item),
  (select (item->>'dispatchToken')::uuid from phase32_dispatch_retry,lateral jsonb_array_elements(result->'operations') item),
  'dispatched',null
)->>'outcome','dispatched','retry scanner dispatches the same pending recovery generation');

create temporary table phase32_worker_claim as
select public.claim_account_deletion('c4800000-0000-4000-8000-000000000001',interval '5 minutes') result;
select is((select result->>'outcome' from phase32_worker_claim),'claimed',
  'recovery event follows the normal pending to deleting claim transition');
select is(public.cleanup_account_business_data(
  'c4800000-0000-4000-8000-000000000001',
  (select (result->>'leaseToken')::uuid from phase32_worker_claim)
)->>'outcome','deleted','recovered pending operation performs business cleanup once');
select is(public.complete_account_deletion(
  'c4800000-0000-4000-8000-000000000001',
  (select (result->>'leaseToken')::uuid from phase32_worker_claim),
  'auth_already_absent',repeat('4',64),null
)->>'status','deleted','recovered pending operation converges to deleted');
select is(public.claim_account_deletion('c4800000-0000-4000-8000-000000000001',interval '5 minutes')->>'outcome','completed',
  'deleted recovery event replay is a no-op');
select is(public.mark_account_deletion_retry_exhausted('c4800000-0000-4000-8000-000000000001',1)->>'outcome','completed',
  'deleted onFailure replay is a no-op');

select results_eq(
  $$select status,recovery_generation,retry_exhausted_count,recovery_eligible_at,recovery_dispatch_token from public.account_deletion_operations where operation_id='c4800000-0000-4000-8000-000000000001'$$,
  $$values ('deleted'::text,1,1,null::timestamptz,null::uuid)$$,
  'completed pending recovery keeps minimal audit counters and no executable marker'
);
select is((select status from public.account_deletion_operations where user_id='c4000000-0000-4000-8000-000000000002'),'deletion_pending',
  'not-due pending account remains pending');
select is((select recovery_dispatch_attempts from public.account_deletion_operations where user_id='c4000000-0000-4000-8000-000000000002'),0,
  'not-due pending account is never dispatched');
select is((select status from public.account_deletion_operations where user_id='c4000000-0000-4000-8000-000000000004'),'active',
  'control account remains unchanged');

select extensions.dblink_disconnect('phase32_recovery_a');
select extensions.dblink_disconnect('phase32_recovery_b');
drop function app_private.test_phase32_recovery_connect(text);
select * from finish();

delete from auth.users where id in(
  'c4000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000002',
  'c4000000-0000-4000-8000-000000000003',
  'c4000000-0000-4000-8000-000000000004'
);
delete from public.account_deletion_operations where user_id in(
  'c4000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000002',
  'c4000000-0000-4000-8000-000000000003',
  'c4000000-0000-4000-8000-000000000004'
);
