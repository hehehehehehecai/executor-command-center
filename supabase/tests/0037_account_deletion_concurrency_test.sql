create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

-- Phase 3 independent double-connection cases:
-- 1 work-first request, 2 request-first work, 3 cancel-first claim,
-- 4 claim-first cancel, 5 unrelated control.
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select user_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'phase3-concurrency-'||n||'@example.test','',now(),'{}','{}',now(),now()
from (
  select n,('b4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid user_id
  from generate_series(1,5) n
) fixture;
insert into public.users(id)
select ('b4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
from generate_series(1,5) n;
insert into public.github_installations(
  id,user_id,installation_id,github_account_id,github_account_login,
  account_type,repository_selection,status,last_verified_at
)
select ('b4100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  940000+n,950000+n,'phase3-concurrency-'||n,'User','selected','active',now()
from generate_series(1,5) n;
insert into public.selected_repositories(
  id,user_id,github_installation_id,github_repository_id,owner_login,name,
  full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch
)
select ('b4200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b4100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  960000+n,'synthetic','phase3-'||n,'synthetic/phase3-'||n,
  'private',true,false,false,false,'main'
from generate_series(1,5) n;
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
select ('b4300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b4200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'Phase 3 concurrency '||n,'One serial order','in_development'
from generate_series(1,5) n;

create function app_private.test_phase3_connect(p_name text)
returns text language sql security definer set search_path=''
as $$select extensions.dblink_connect(p_name,'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres')$$;
create function app_private.test_phase3_wait_for_lock(p_pid integer,p_timeout interval default interval '2 seconds')
returns boolean language plpgsql set search_path=''
as $$
declare deadline timestamptz:=clock_timestamp()+p_timeout;
begin
  loop
    if exists(select 1 from pg_catalog.pg_stat_activity where pid=p_pid and wait_event_type='Lock') then return true; end if;
    if clock_timestamp()>=deadline then return false; end if;
    perform pg_sleep(0.01);
  end loop;
end;
$$;
create function app_private.test_phase3_request(p_user uuid,p_key text)
returns jsonb language plpgsql set search_path=''
as $$begin
  perform set_config('lock_timeout','3s',true); perform set_config('statement_timeout','5s',true);
  return public.request_account_deletion(p_user,p_key,'DELETE ACCOUNT '||p_user::text);
end$$;
create function app_private.test_phase3_sync(p_project uuid,p_key text)
returns jsonb language plpgsql set search_path=''
as $$begin
  perform set_config('lock_timeout','3s',true); perform set_config('statement_timeout','5s',true);
  return public.create_sync_run(p_project,p_key,'manual');
end$$;
create function app_private.test_phase3_cancel(p_user uuid,p_operation uuid)
returns jsonb language plpgsql set search_path=''
as $$begin
  perform set_config('lock_timeout','3s',true); perform set_config('statement_timeout','5s',true);
  return public.cancel_account_deletion(p_user,p_operation);
end$$;
create function app_private.test_phase3_claim(p_operation uuid)
returns jsonb language plpgsql set search_path=''
as $$begin
  perform set_config('lock_timeout','3s',true); perform set_config('statement_timeout','5s',true);
  return public.claim_account_deletion(p_operation,interval '5 minutes');
end$$;

select app_private.test_phase3_connect('phase3_a');
select app_private.test_phase3_connect('phase3_b');
select app_private.test_phase3_connect('phase3_control');
create temporary table phase3_pids(name text primary key,pid integer);
insert into phase3_pids
select 'a',pid from extensions.dblink('phase3_a','select pg_backend_pid()') r(pid integer)
union all select 'b',pid from extensions.dblink('phase3_b','select pg_backend_pid()') r(pid integer);

-- R1: work commits first; request waits, then sees and cancels it.
select extensions.dblink_exec('phase3_a','begin');
select result from extensions.dblink('phase3_a',
  $$select app_private.test_phase3_sync('b4300000-0000-4000-8000-000000000001','phase3:concurrency:work-first')$$
) r(result jsonb);
select is(extensions.dblink_send_query('phase3_b',
  $$select app_private.test_phase3_request('b4000000-0000-4000-8000-000000000001','phase3:request:work-first')$$
),1,'R1 deletion request is dispatched while work owns the Installation lock');
select ok(app_private.test_phase3_wait_for_lock((select pid from phase3_pids where name='b')),
  'R1 request waits on the work-owned Installation row');
select extensions.dblink_exec('phase3_a','commit');
select result from extensions.dblink_get_result('phase3_b') r(result jsonb);
select * from extensions.dblink_get_result('phase3_b') drain(result jsonb);
select is((select status from public.sync_runs where idempotency_key='phase3:concurrency:work-first'),
  'cancelled','R1 request terminalizes the work that committed first');

-- R2: request commits first; new work waits, rechecks account state, and fails.
select extensions.dblink_exec('phase3_a','begin');
select result from extensions.dblink('phase3_a',
  $$select app_private.test_phase3_request('b4000000-0000-4000-8000-000000000002','phase3:request:first')$$
) r(result jsonb);
select is(extensions.dblink_send_query('phase3_b',
  $$select app_private.test_phase3_sync('b4300000-0000-4000-8000-000000000002','phase3:concurrency:request-first')$$
),1,'R2 Sync is dispatched while request is uncommitted');
select ok(app_private.test_phase3_wait_for_lock((select pid from phase3_pids where name='b')),
  'R2 Sync waits on the request-owned Installation row');
select result from extensions.dblink('phase3_control',
  $$select app_private.test_phase3_sync('b4300000-0000-4000-8000-000000000005','phase3:concurrency:control')$$
) r(result jsonb);
select extensions.dblink_exec('phase3_a','commit');
select * from extensions.dblink_get_result('phase3_b',false) r(result jsonb);
select ok(extensions.dblink_error_message('phase3_b') like '%account_deletion_pending%',
  'R2 waiting Sync rechecks the account gate with the stable error');
select * from extensions.dblink_get_result('phase3_b',false) drain(result jsonb);
select is((select count(*) from public.sync_runs where idempotency_key='phase3:concurrency:request-first'),0::bigint,
  'R2 leaves no post-request queued survivor');
select is((select status from public.sync_runs where idempotency_key='phase3:concurrency:control'),'queued',
  'unrelated account proceeds without cross-account blocking');

-- Prepare cancel/claim fixtures.
select app_private.test_phase3_request('b4000000-0000-4000-8000-000000000003','phase3:cancel-first');
select app_private.test_phase3_request('b4000000-0000-4000-8000-000000000004','phase3:claim-first');
create temporary table phase3_operations as
select user_id,operation_id from public.account_deletion_operations
where user_id in('b4000000-0000-4000-8000-000000000003','b4000000-0000-4000-8000-000000000004');

-- C1: cancellation wins inside the window; waiting claim returns cancelled.
select extensions.dblink_exec('phase3_a','begin');
select result from extensions.dblink('phase3_a',format(
  $$select app_private.test_phase3_cancel('b4000000-0000-4000-8000-000000000003','%s')$$,
  (select operation_id from phase3_operations where user_id='b4000000-0000-4000-8000-000000000003')
)) r(result jsonb);
select is(extensions.dblink_send_query('phase3_b',format(
  $$select app_private.test_phase3_claim('%s')$$,
  (select operation_id from phase3_operations where user_id='b4000000-0000-4000-8000-000000000003')
)),1,'C1 claim is dispatched while cancel owns the lifecycle row');
select ok(app_private.test_phase3_wait_for_lock((select pid from phase3_pids where name='b')),
  'C1 claim waits on cancellation');
select extensions.dblink_exec('phase3_a','commit');
select is((select result->>'outcome' from extensions.dblink_get_result('phase3_b') r(result jsonb)),
  'cancelled','C1 waiting claim observes active/cancelled');
select * from extensions.dblink_get_result('phase3_b') drain(result jsonb);

-- C2: due claim wins; waiting cancel fails closed.
update public.account_deletion_operations operation set
  due_at=fixture_time.value,requested_at=fixture_time.value-interval '7 days'
from (select clock_timestamp()-interval '1 second' value) fixture_time
where operation.user_id='b4000000-0000-4000-8000-000000000004';
select extensions.dblink_exec('phase3_a','begin');
select result from extensions.dblink('phase3_a',format(
  $$select app_private.test_phase3_claim('%s')$$,
  (select operation_id from phase3_operations where user_id='b4000000-0000-4000-8000-000000000004')
)) r(result jsonb);
select is(extensions.dblink_send_query('phase3_b',format(
  $$select app_private.test_phase3_cancel('b4000000-0000-4000-8000-000000000004','%s')$$,
  (select operation_id from phase3_operations where user_id='b4000000-0000-4000-8000-000000000004')
)),1,'C2 cancel is dispatched while claim owns the lifecycle row');
select ok(app_private.test_phase3_wait_for_lock((select pid from phase3_pids where name='b')),
  'C2 cancel waits on due claim');
select extensions.dblink_exec('phase3_a','commit');
select * from extensions.dblink_get_result('phase3_b',false) r(result jsonb);
select ok(extensions.dblink_error_message('phase3_b') like '%account_deletion_cancel_window_closed%',
  'C2 waiting cancellation observes deleting and fails closed');
select * from extensions.dblink_get_result('phase3_b',false) drain(result jsonb);
select is((select status from public.account_deletion_operations where user_id='b4000000-0000-4000-8000-000000000004'),
  'deleting','C2 has one claim winner');

select extensions.dblink_disconnect('phase3_a');
select extensions.dblink_disconnect('phase3_b');
select extensions.dblink_disconnect('phase3_control');
drop function app_private.test_phase3_claim(uuid);
drop function app_private.test_phase3_cancel(uuid,uuid);
drop function app_private.test_phase3_sync(uuid,text);
drop function app_private.test_phase3_request(uuid,text);
drop function app_private.test_phase3_wait_for_lock(integer,interval);
drop function app_private.test_phase3_connect(text);

delete from public.account_deletion_operations where user_id::text like 'b4000000-0000-4000-8000-%';
delete from auth.users where id::text like 'b4000000-0000-4000-8000-%';
select * from finish();
