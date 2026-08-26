create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();

-- Phase 2.1 uses eight isolated target installations (work-first and
-- revoke-first for each gate) plus one unrelated control installation.
insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
select user_id,'00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
from (values
  ('a1000000-0000-4000-8000-000000000001'::uuid,'phase2-1-sync-work@example.test'),
  ('a1000000-0000-4000-8000-000000000002'::uuid,'phase2-1-sync-revoke@example.test'),
  ('a1000000-0000-4000-8000-000000000003'::uuid,'phase2-1-energy-work@example.test'),
  ('a1000000-0000-4000-8000-000000000004'::uuid,'phase2-1-energy-revoke@example.test'),
  ('a1000000-0000-4000-8000-000000000005'::uuid,'phase2-1-ai-work@example.test'),
  ('a1000000-0000-4000-8000-000000000006'::uuid,'phase2-1-ai-revoke@example.test'),
  ('a1000000-0000-4000-8000-000000000007'::uuid,'phase2-1-snapshot-work@example.test'),
  ('a1000000-0000-4000-8000-000000000008'::uuid,'phase2-1-snapshot-revoke@example.test'),
  ('a1000000-0000-4000-8000-000000000009'::uuid,'phase2-1-control@example.test')
) fixture(user_id,email);

insert into public.users(id)
select ('a1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
from generate_series(1,9) n;

insert into public.github_installations(
  id,user_id,installation_id,github_account_id,github_account_login,
  account_type,repository_selection,status,last_verified_at
)
select
  ('a1100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('a1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  921000+n,931000+n,'phase2-1-'||n,'User','selected','active',now()
from generate_series(1,9) n;

insert into public.selected_repositories(
  id,user_id,github_installation_id,github_repository_id,owner_login,name,
  full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch
)
select
  ('a1200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('a1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('a1100000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  922000+n,'synthetic','gate-'||n,'synthetic/gate-'||n,
  'private',true,false,false,false,'main'
from generate_series(1,9) n;

insert into public.projects(
  id,user_id,selected_repository_id,core_goal,current_stage_goal,status
)
select
  ('a1300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('a1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('a1200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'Phase 2.1 gate '||n,'One installation serial order','in_development'
from generate_series(1,9) n;

select public.register_github_webhook_delivery(
  ('a1400000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  repeat(substr('12345678',n,1),64),'installation','deleted',
  921000+n,null,null,
  'github-webhook:a1400000-0000-4000-8000-'||lpad(n::text,12,'0'),
  true,'2026-08-25T04:00:00Z'::timestamptz + n*interval '1 minute'
)
from generate_series(1,8) n;

create function app_private.test_phase2_1_connect(p_name text)
returns text language sql security definer set search_path=''
as $$
  select extensions.dblink_connect(
    p_name,
    'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
  );
$$;

create function app_private.test_phase2_1_wait_for_lock(
  p_pid integer,
  p_timeout interval default interval '2 seconds'
)
returns boolean language plpgsql set search_path=''
as $$
declare deadline timestamptz := pg_catalog.clock_timestamp()+p_timeout;
begin
  loop
    if exists (
      select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid=p_pid and activity.wait_event_type='Lock'
    ) then return true;
    end if;
    if pg_catalog.clock_timestamp()>=deadline then return false;
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

create function app_private.test_phase2_1_revoke(
  p_delivery uuid,
  p_completed_at timestamptz
)
returns jsonb language plpgsql set search_path=''
as $$
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','5s',true);
  return public.complete_github_webhook_installation(
    p_delivery,1,'revoked',p_completed_at
  );
end;
$$;

create function app_private.test_phase2_1_sync(p_project uuid,p_key text)
returns jsonb language plpgsql set search_path=''
as $$
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','5s',true);
  return public.create_sync_run(p_project,p_key,'first_sync');
end;
$$;

create function app_private.test_phase2_1_reserve(
  p_user uuid,p_project uuid,p_key text
)
returns jsonb language plpgsql set search_path=''
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.format('{"sub":"%s","role":"authenticated"}',p_user),true
  );
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','5s',true);
  return public.reserve_project_brief_energy(p_project,p_key);
end;
$$;

create function app_private.test_phase2_1_complete_ai(
  p_id uuid,p_user uuid,p_project uuid
)
returns jsonb language plpgsql set search_path=''
as $$
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','5s',true);
  insert into public.ai_invocations(
    id,user_id,project_id,feature,status,created_at,started_at,completed_at
  ) values (
    p_id,p_user,p_project,'project_brief','completed',
    '2026-08-25T04:10:00Z','2026-08-25T04:10:00Z','2026-08-25T04:10:01Z'
  );
  return jsonb_build_object('completed',true,'invocation_id',p_id);
end;
$$;

create function app_private.test_phase2_1_snapshot(
  p_project uuid,p_object_id text
)
returns jsonb language plpgsql set search_path=''
as $$
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','5s',true);
  insert into public.github_repository_snapshots(
    project_id,github_object_id,repository_full_name,default_branch,
    visibility,is_private,is_fork,is_archived,is_disabled,
    source_updated_at,source_version
  ) values (
    p_project,p_object_id,'synthetic/concurrency','main',
    'private',true,false,false,false,'2026-08-25T04:10:00Z','v1'
  );
  return jsonb_build_object('inserted',true,'github_object_id',p_object_id);
end;
$$;

create temporary table phase2_1_connection_pids(
  name text primary key,
  pid integer not null
);

-- Connect reusable A/B sessions and one unrelated control session.
select app_private.test_phase2_1_connect('phase2_1_a');
select app_private.test_phase2_1_connect('phase2_1_b');
select app_private.test_phase2_1_connect('phase2_1_control');
insert into phase2_1_connection_pids
select 'a',pid from extensions.dblink('phase2_1_a','select pg_backend_pid()') as r(pid integer)
union all
select 'b',pid from extensions.dblink('phase2_1_b','select pg_backend_pid()') as r(pid integer)
union all
select 'control',pid from extensions.dblink('phase2_1_control','select pg_backend_pid()') as r(pid integer);

-- Case S1: work gets the Installation lock first; revoke must wait and then
-- see/cancel the committed queued run.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_sync(
    'a1300000-0000-4000-8000-000000000001','phase2-1:sync:work-first'
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000001',pg_catalog.clock_timestamp()
  )$$
),1,'S1 revoke is dispatched after queued Sync work');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'S1 revoke waits on the work-owned Installation row lock');
select extensions.dblink_exec('phase2_1_a','commit');
select result from extensions.dblink_get_result('phase2_1_b') as r(result jsonb);
select * from extensions.dblink_get_result('phase2_1_b') as drain(result jsonb);
select is((select status from public.sync_runs where idempotency_key='phase2-1:sync:work-first'),
  'cancelled','S1 revoke sees and cancels the committed queued Sync');

-- Case S2: revoke owns the lock first; Sync waits, rechecks, and fails.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000002',pg_catalog.clock_timestamp()
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_sync(
    'a1300000-0000-4000-8000-000000000002','phase2-1:sync:revoke-first'
  )$$
),1,'S2 Sync is dispatched while revoke is uncommitted');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'S2 Sync waits on the revoke-owned Installation row lock');
select result from extensions.dblink(
  'phase2_1_control',
  $$select app_private.test_phase2_1_sync(
    'a1300000-0000-4000-8000-000000000009','phase2-1:control:sync'
  )$$
) as r(result jsonb);
select extensions.dblink_exec('phase2_1_a','commit');
select * from extensions.dblink_get_result('phase2_1_b',false) as r(result jsonb);
select ok(extensions.dblink_error_message('phase2_1_b') like '%sync_run_authorization_revoked%',
  'S2 waiting Sync rechecks revoked and returns the stable error');
select * from extensions.dblink_get_result('phase2_1_b',false) as drain(result jsonb);
select is((select count(*) from public.sync_runs where idempotency_key='phase2-1:sync:revoke-first'),
  0::bigint,'S2 revoked-first Sync leaves no queued survivor');
select is((select status from public.sync_runs where idempotency_key='phase2-1:control:sync'),
  'queued','unrelated Installation proceeds while target revoke lock is held');

-- Case E1: reservation commits before revoke; revoke waits, then releases it.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_reserve(
    'a1000000-0000-4000-8000-000000000003',
    'a1300000-0000-4000-8000-000000000003','phase2-1:energy:work-first'
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000003',pg_catalog.clock_timestamp()
  )$$
),1,'E1 revoke is dispatched after reservation work');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'E1 revoke waits on the reservation-owned Installation row lock');
select extensions.dblink_exec('phase2_1_a','commit');
select result from extensions.dblink_get_result('phase2_1_b') as r(result jsonb);
select * from extensions.dblink_get_result('phase2_1_b') as drain(result jsonb);
select is((select status from public.energy_reservations where request_key='phase2-1:energy:work-first'),
  'released','E1 revoke sees and releases the committed reservation');
select is((select sum(delta) from public.energy_ledger_entries where user_id='a1000000-0000-4000-8000-000000000003'),
  10::bigint,'E1 reservation plus revoke refund preserves Energy');

-- Case E2: revoke first; reservation waits and rolls back grant/reservation.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000004',pg_catalog.clock_timestamp()
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_reserve(
    'a1000000-0000-4000-8000-000000000004',
    'a1300000-0000-4000-8000-000000000004','phase2-1:energy:revoke-first'
  )$$
),1,'E2 reservation is dispatched while revoke is uncommitted');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'E2 reservation waits on the revoke-owned Installation row lock');
select extensions.dblink_exec('phase2_1_a','commit');
select * from extensions.dblink_get_result('phase2_1_b',false) as r(result jsonb);
select ok(extensions.dblink_error_message('phase2_1_b') like '%project_brief_authorization_failed%',
  'E2 waiting reservation rechecks revoked with the stable error');
select * from extensions.dblink_get_result('phase2_1_b',false) as drain(result jsonb);
select results_eq(
  $$select
      (select count(*) from public.energy_reservations where request_key='phase2-1:energy:revoke-first')::bigint,
      (select count(*) from public.energy_ledger_entries where user_id='a1000000-0000-4000-8000-000000000004')::bigint$$,
  $$values (0::bigint,0::bigint)$$,
  'E2 revoked-first reservation leaves no reservation or grant side effect'
);

-- Case A1: completed invocation commits first; revoke must wait. The completed
-- fact is historical and was committed before the authoritative revoke.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_complete_ai(
    'a1500000-0000-4000-8000-000000000005',
    'a1000000-0000-4000-8000-000000000005',
    'a1300000-0000-4000-8000-000000000005'
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000005',pg_catalog.clock_timestamp()
  )$$
),1,'A1 revoke is dispatched after completed AI work');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'A1 revoke waits on the AI completion-owned Installation row lock');
select extensions.dblink_exec('phase2_1_a','commit');
select result from extensions.dblink_get_result('phase2_1_b') as r(result jsonb);
select * from extensions.dblink_get_result('phase2_1_b') as drain(result jsonb);
select is((select status from public.ai_invocations where id='a1500000-0000-4000-8000-000000000005'),
  'completed','A1 completion is ordered before revoke, never after it');

-- Case A2: revoke first; completed invocation waits and is rejected.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000006',pg_catalog.clock_timestamp()
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_complete_ai(
    'a1500000-0000-4000-8000-000000000006',
    'a1000000-0000-4000-8000-000000000006',
    'a1300000-0000-4000-8000-000000000006'
  )$$
),1,'A2 AI completion is dispatched while revoke is uncommitted');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'A2 AI completion waits on the revoke-owned Installation row lock');
select extensions.dblink_exec('phase2_1_a','commit');
select * from extensions.dblink_get_result('phase2_1_b',false) as r(result jsonb);
select ok(extensions.dblink_error_message('phase2_1_b') like '%project_brief_authorization_failed%',
  'A2 waiting completion rechecks revoked with the stable error');
select * from extensions.dblink_get_result('phase2_1_b',false) as drain(result jsonb);
select is((select count(*) from public.ai_invocations where id='a1500000-0000-4000-8000-000000000006'),
  0::bigint,'A2 revoked-first completion leaves no AI survivor');

-- Case G1: snapshot commits before revoke; revoke must wait.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_snapshot(
    'a1300000-0000-4000-8000-000000000007','phase2-1:snapshot:work-first'
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000007',pg_catalog.clock_timestamp()
  )$$
),1,'G1 revoke is dispatched after snapshot work');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'G1 revoke waits on the snapshot-owned Installation row lock');
select extensions.dblink_exec('phase2_1_a','commit');
select result from extensions.dblink_get_result('phase2_1_b') as r(result jsonb);
select * from extensions.dblink_get_result('phase2_1_b') as drain(result jsonb);
select is((select count(*) from public.github_repository_snapshots where github_object_id='phase2-1:snapshot:work-first'),
  1::bigint,'G1 snapshot is ordered before revoke, never after it');

-- Case G2: revoke first; snapshot waits and is rejected.
select extensions.dblink_exec('phase2_1_a','begin');
select result from extensions.dblink(
  'phase2_1_a',
  $$select app_private.test_phase2_1_revoke(
    'a1400000-0000-4000-8000-000000000008',pg_catalog.clock_timestamp()
  )$$
) as r(result jsonb);
select is(extensions.dblink_send_query(
  'phase2_1_b',
  $$select app_private.test_phase2_1_snapshot(
    'a1300000-0000-4000-8000-000000000008','phase2-1:snapshot:revoke-first'
  )$$
),1,'G2 snapshot is dispatched while revoke is uncommitted');
select ok(app_private.test_phase2_1_wait_for_lock(
  (select pid from phase2_1_connection_pids where name='b')
),'G2 snapshot waits on the revoke-owned Installation row lock');
select extensions.dblink_exec('phase2_1_a','commit');
select * from extensions.dblink_get_result('phase2_1_b',false) as r(result jsonb);
select ok(extensions.dblink_error_message('phase2_1_b') like '%github_activity_authorization_revoked%',
  'G2 waiting snapshot rechecks revoked with the stable error');
select * from extensions.dblink_get_result('phase2_1_b',false) as drain(result jsonb);
select is((select count(*) from public.github_repository_snapshots where github_object_id='phase2-1:snapshot:revoke-first'),
  0::bigint,'G2 revoked-first snapshot leaves no survivor');

select extensions.dblink_disconnect('phase2_1_a');
select extensions.dblink_disconnect('phase2_1_b');
select extensions.dblink_disconnect('phase2_1_control');

drop function app_private.test_phase2_1_snapshot(uuid,text);
drop function app_private.test_phase2_1_complete_ai(uuid,uuid,uuid);
drop function app_private.test_phase2_1_reserve(uuid,uuid,text);
drop function app_private.test_phase2_1_sync(uuid,text);
drop function app_private.test_phase2_1_revoke(uuid,timestamptz);
drop function app_private.test_phase2_1_wait_for_lock(integer,interval);
drop function app_private.test_phase2_1_connect(text);

alter table public.energy_ledger_entries disable trigger energy_ledger_entries_immutable;
delete from public.energy_ledger_entries
where user_id::text like 'a1000000-0000-4000-8000-00000000000%';
alter table public.energy_ledger_entries enable trigger energy_ledger_entries_immutable;
delete from public.github_webhook_deliveries
where delivery_id::text like 'a1400000-0000-4000-8000-00000000000%';
delete from auth.users
where id::text like 'a1000000-0000-4000-8000-00000000000%';

select * from finish();
