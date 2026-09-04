create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

-- Phase 3.1 independent double-connection Webhook/request fixture.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',format('phase31-concurrency-%s@example.test',n),'',now(),'{}','{}',now(),now()
from generate_series(1,3) n;
insert into public.users(id) select ('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at)
select ('c2100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,932000+n,932000+n,format('phase31-concurrency-%s',n),'User','selected','active',now()
from generate_series(1,3) n;
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
select ('c2200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c2100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,932100+n,'synthetic',format('phase31-concurrency-%s',n),format('synthetic/phase31-concurrency-%s',n),'private',true,false,false,false,'main'
from generate_series(1,3) n;
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
select ('c2300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('c2200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Phase 3.1 concurrency','Serialize webhook writes','in_development'
from generate_series(1,3) n;

create function app_private.test_phase31_connect(p_name text)
returns text language sql security definer set search_path=''
as $$select extensions.dblink_connect(p_name,'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres')$$;
create function app_private.test_phase31_wait_for_lock(p_pid integer,p_timeout interval default interval '2 seconds')
returns boolean language plpgsql set search_path=''
as $$declare deadline timestamptz:=clock_timestamp()+p_timeout; begin
  loop
    if exists(select 1 from pg_catalog.pg_stat_activity activity where activity.pid=p_pid and activity.wait_event_type='Lock') then return true; end if;
    if clock_timestamp()>=deadline then return false; end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end$$;
create function app_private.test_phase31_request(p_user uuid,p_key text)
returns jsonb language plpgsql set search_path=''
as $$declare result jsonb; stable_operation uuid; begin
  perform set_config('lock_timeout','3s',true); perform set_config('statement_timeout','5s',true);
  result:=public.request_account_deletion(p_user,p_key,'DELETE ACCOUNT '||p_user::text);
  stable_operation:=case p_user
    when 'c2000000-0000-4000-8000-000000000001'::uuid then 'c2800000-0000-4000-8000-000000000001'::uuid
    when 'c2000000-0000-4000-8000-000000000002'::uuid then 'c2800000-0000-4000-8000-000000000002'::uuid
    else (result->>'operationId')::uuid end;
  update public.account_deletion_operations operation set operation_id=stable_operation
  where operation.operation_id=(result->>'operationId')::uuid;
  return jsonb_set(result,'{operationId}',to_jsonb(stable_operation::text));
end$$;
create function app_private.test_phase31_webhook(p_delivery uuid,p_event text,p_installation bigint,p_repository bigint,p_name text)
returns jsonb language plpgsql set search_path=''
as $$begin perform set_config('lock_timeout','3s',true); perform set_config('statement_timeout','5s',true);
  return public.register_github_webhook_delivery(p_delivery,repeat('e',64),p_event,
    case when p_event='installation' then 'deleted' else 'opened' end,
    p_installation,p_repository,p_name,'github-webhook:'||p_delivery::text,true,clock_timestamp()); end$$;

select app_private.test_phase31_connect('phase31_a');
select app_private.test_phase31_connect('phase31_b');
select app_private.test_phase31_connect('phase31_control');
create temporary table phase31_pids(name text primary key,pid integer);
insert into phase31_pids
select 'a',pid from extensions.dblink('phase31_a','select pg_backend_pid()') r(pid integer)
union all select 'b',pid from extensions.dblink('phase31_b','select pg_backend_pid()') r(pid integer);

-- W1: Webhook owns Installation first; request must wait and then terminalize/delete it.
select extensions.dblink_exec('phase31_a','begin');
select result from extensions.dblink('phase31_a',
  $$select app_private.test_phase31_webhook('c2410000-0000-4000-8000-000000000001','issues',932001,932101,'synthetic/phase31-concurrency-1')$$
) r(result jsonb);
select is(extensions.dblink_send_query('phase31_b',
  $$select app_private.test_phase31_request('c2000000-0000-4000-8000-000000000001','phase31:webhook-first')$$
),1,'webhook-first request is dispatched while webhook transaction is open');
select ok(app_private.test_phase31_wait_for_lock((select pid from phase31_pids where name='b')),
  'webhook-first request waits on the same Installation row');
select extensions.dblink_exec('phase31_a','commit');
select result from extensions.dblink_get_result('phase31_b') r(result jsonb);
select * from extensions.dblink_get_result('phase31_b') drain(result jsonb);
select is((select status from public.github_webhook_deliveries where delivery_id='c2410000-0000-4000-8000-000000000001'),'ignored',
  'request sees and terminalizes webhook work that committed first');

-- W2: request owns Installation first; Webhook waits, rechecks lifecycle, and leaves no row.
select extensions.dblink_exec('phase31_a','begin');
select result from extensions.dblink('phase31_a',
  $$select app_private.test_phase31_request('c2000000-0000-4000-8000-000000000002','phase31:request-first')$$
) r(result jsonb);
select is(extensions.dblink_send_query('phase31_b',
  $$select app_private.test_phase31_webhook('c2410000-0000-4000-8000-000000000002','installation',932002,null,null)$$
),1,'request-first webhook is dispatched while request transaction is open');
select ok(app_private.test_phase31_wait_for_lock((select pid from phase31_pids where name='b')),
  'request-first webhook waits on the same Installation row');
select result from extensions.dblink('phase31_control',
  $$select app_private.test_phase31_webhook('c2410000-0000-4000-8000-000000000003','issues',932003,932103,'synthetic/phase31-concurrency-3')$$
) r(result jsonb);
select extensions.dblink_exec('phase31_a','commit');
select * from extensions.dblink_get_result('phase31_b',false) r(result jsonb);
select ok(extensions.dblink_error_message('phase31_b') like '%account_deletion_pending%',
  'waiting webhook rechecks the account lifecycle with the stable error');
select * from extensions.dblink_get_result('phase31_b',false) drain(result jsonb);
select is((select count(*) from public.github_webhook_deliveries where delivery_id='c2410000-0000-4000-8000-000000000002'),0::bigint,
  'request-first leaves no post-request target webhook metadata');
select is((select count(*) from public.github_webhook_deliveries where delivery_id='c2410000-0000-4000-8000-000000000003'),1::bigint,
  'other Installation proceeds without cross-account blocking');

select extensions.dblink_disconnect('phase31_a');
select extensions.dblink_disconnect('phase31_b');
select extensions.dblink_disconnect('phase31_control');
drop function app_private.test_phase31_webhook(uuid,text,bigint,bigint,text);
drop function app_private.test_phase31_request(uuid,text);
drop function app_private.test_phase31_wait_for_lock(integer,interval);
drop function app_private.test_phase31_connect(text);
select * from finish();

delete from public.github_webhook_deliveries where delivery_id in(
  'c2410000-0000-4000-8000-000000000001',
  'c2410000-0000-4000-8000-000000000002',
  'c2410000-0000-4000-8000-000000000003'
);
delete from auth.users where id in(
  'c2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002',
  'c2000000-0000-4000-8000-000000000003'
);
delete from public.account_deletion_operations where user_id in(
  'c2000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002',
  'c2000000-0000-4000-8000-000000000003'
);
