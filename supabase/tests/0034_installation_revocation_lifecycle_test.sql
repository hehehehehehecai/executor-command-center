begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Phase 2 synthetic lineage. Every identity is isolated from earlier suites.
-- delivery revoke: f2400000-0000-4000-8000-000000000001
-- installation:     f2410000-0000-4000-8000-000000000001 / 824001
-- target project:   f2430000-0000-4000-8000-000000000001
-- control project:  f2530000-0000-4000-8000-000000000002
insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('f2400000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','phase2-target@example.test','',now(),'{}','{}',now(),now()),
  ('f2500000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','phase2-control@example.test','',now(),'{}','{}',now(),now());
insert into public.users(id) values
  ('f2400000-0000-4000-8000-000000000001'),
  ('f2500000-0000-4000-8000-000000000002');

insert into public.github_installations(
  id,user_id,installation_id,github_account_id,github_account_login,
  account_type,repository_selection,status,last_verified_at
) values
  ('f2410000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001',824001,824001,'phase2-target','User','selected','active','2026-08-25T01:00:00Z'),
  ('f2510000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000002',825002,825002,'phase2-control','User','selected','active','2026-08-25T01:00:00Z');
insert into public.selected_repositories(
  id,user_id,github_installation_id,github_repository_id,owner_login,name,
  full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch
) values
  ('f2420000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001','f2410000-0000-4000-8000-000000000001',824101,'synthetic','target','synthetic/target','private',true,false,false,false,'main'),
  ('f2520000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000002','f2510000-0000-4000-8000-000000000002',825102,'synthetic','control','synthetic/control','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status) values
  ('f2430000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001','f2420000-0000-4000-8000-000000000001','Phase 2 target','Revoke safely','in_development'),
  ('f2530000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000002','f2520000-0000-4000-8000-000000000002','Phase 2 control','Remain unchanged','in_development');

insert into public.sync_runs(
  id,project_id,idempotency_key,trigger_source,status,version,queued_at,created_at,updated_at
) values
  ('f2440000-0000-4000-8000-000000000001','f2430000-0000-4000-8000-000000000001','phase2:queued','manual','queued',1,'2026-08-25T01:01:00Z','2026-08-25T01:01:00Z','2026-08-25T01:01:00Z'),
  ('f2540000-0000-4000-8000-000000000002','f2530000-0000-4000-8000-000000000002','phase2:control','manual','queued',1,'2026-08-25T01:01:00Z','2026-08-25T01:01:00Z','2026-08-25T01:01:00Z');
insert into public.project_sync_dispatches(
  id,project_id,sync_run_id,request_identity,trigger_source,requested_at,created_at,updated_at
) values
  ('f2450000-0000-4000-8000-000000000001','f2430000-0000-4000-8000-000000000001','f2440000-0000-4000-8000-000000000001','phase2:queued','manual','2026-08-25T01:01:00Z','2026-08-25T01:01:00Z','2026-08-25T01:01:00Z'),
  ('f2550000-0000-4000-8000-000000000002','f2530000-0000-4000-8000-000000000002','f2540000-0000-4000-8000-000000000002','phase2:control','manual','2026-08-25T01:01:00Z','2026-08-25T01:01:00Z','2026-08-25T01:01:00Z');

insert into public.energy_ledger_entries(user_id,business_date,idempotency_key,entry_type,amount,delta) values
  ('f2400000-0000-4000-8000-000000000001','2026-08-25','phase2-grant-target','grant',10,10),
  ('f2500000-0000-4000-8000-000000000002','2026-08-25','phase2-grant-control','grant',10,10);
insert into public.energy_reservations(
  id,user_id,project_id,business_date,request_key,amount,status,created_at
) values
  ('f2460000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001','f2430000-0000-4000-8000-000000000001','2026-08-25','phase2:brief:target',3,'reserved','2026-08-25T01:02:00Z'),
  ('f2560000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000002','f2530000-0000-4000-8000-000000000002','2026-08-25','phase2:brief:control',3,'reserved','2026-08-25T01:02:00Z');
insert into public.ai_invocations(
  id,user_id,project_id,feature,status,reservation_id,created_at,started_at
) values
  ('f2470000-0000-4000-8000-000000000001','f2400000-0000-4000-8000-000000000001','f2430000-0000-4000-8000-000000000001','project_brief','pending','f2460000-0000-4000-8000-000000000001','2026-08-25T01:02:00Z','2026-08-25T01:02:01Z'),
  ('f2570000-0000-4000-8000-000000000002','f2500000-0000-4000-8000-000000000002','f2530000-0000-4000-8000-000000000002','project_brief','pending','f2560000-0000-4000-8000-000000000002','2026-08-25T01:02:00Z','2026-08-25T01:02:01Z');
insert into public.energy_ledger_entries(
  user_id,project_id,business_date,idempotency_key,entry_type,amount,delta,reservation_id
) values
  ('f2400000-0000-4000-8000-000000000001','f2430000-0000-4000-8000-000000000001','2026-08-25','phase2-reserved-target','reserved',3,-3,'f2460000-0000-4000-8000-000000000001'),
  ('f2500000-0000-4000-8000-000000000002','f2530000-0000-4000-8000-000000000002','2026-08-25','phase2-reserved-control','reserved',3,-3,'f2560000-0000-4000-8000-000000000002');

select is(
  public.register_github_webhook_delivery(
    'f2480000-0000-4000-8000-000000000001',repeat('a',64),'issues','opened',
    824001,824101,'synthetic/target','github-webhook:f2480000-0000-4000-8000-000000000001',true,'2026-08-25T01:03:00Z'
  )->>'status','pending','target ordinary delivery is pending before revocation'
);
select is(
  public.register_github_webhook_delivery(
    'f2490000-0000-4000-8000-000000000001',repeat('b',64),'installation','deleted',
    824001,null,null,'github-webhook:f2490000-0000-4000-8000-000000000001',true,'2026-08-25T01:04:00Z'
  )->>'status','pending','trusted delete delivery is pending'
);

select lives_ok(
  $$select public.complete_github_webhook_installation(
    'f2490000-0000-4000-8000-000000000001',1,'revoked','2026-08-25T01:04:01Z'
  )$$,
  'trusted delete atomically completes'
);
select results_eq(
  $$select status::text,revoked_at from public.github_installations where id='f2410000-0000-4000-8000-000000000001'$$,
  $$values ('revoked'::text,'2026-08-25T01:04:01Z'::timestamptz)$$,
  'installation becomes revoked at the authoritative first completion time'
);
select is((select status from public.sync_runs where id='f2440000-0000-4000-8000-000000000001'),'cancelled','queued sync is cancelled');
select results_eq(
  $$select dispatch_status,safe_error_code from public.project_sync_dispatches where id='f2450000-0000-4000-8000-000000000001'$$,
  $$values ('cancelled'::text,'authorization_revoked'::text)$$,
  'pending dispatcher work reaches an explicit terminal cancellation'
);
select is((select status from public.github_webhook_deliveries where delivery_id='f2480000-0000-4000-8000-000000000001'),'ignored','pending ordinary webhook dispatch is suppressed');
select results_eq(
  $$select status,failure_stage,error_code from public.energy_reservations where id='f2460000-0000-4000-8000-000000000001'$$,
  $$values ('released'::text,'authorization'::text,'project_brief_authorization_failed'::text)$$,
  'reserved AI energy is released with the stable authorization contract'
);
select results_eq(
  $$select status,failure_stage,error_code from public.ai_invocations where id='f2470000-0000-4000-8000-000000000001'$$,
  $$values ('failed'::text,'authorization'::text,'project_brief_authorization_failed'::text)$$,
  'started AI invocation becomes a stable authorization failure'
);
select is((select count(*)::text from public.energy_ledger_entries where reservation_id='f2460000-0000-4000-8000-000000000001' and entry_type='released'),'1','one refund fact is emitted');

select throws_ok(
  $$select public.create_sync_run('f2430000-0000-4000-8000-000000000001','phase2:new-first-sync','first_sync')$$,
  'P0001','sync_run_authorization_revoked',
  'revoked installation cannot create a First Sync run'
);
select is(public.request_project_sync('f2430000-0000-4000-8000-000000000001','manual','phase2:new-manual','f2400000-0000-4000-8000-000000000001','2026-08-25T01:05:00Z')->>'outcome','authorization_revoked','revoked installation blocks manual sync before dispatch');

-- Different-delivery replay must not move revoked_at or repeat cancellation/refund.
select is(
  public.register_github_webhook_delivery(
    'f2490000-0000-4000-8000-000000000002',repeat('c',64),'installation','deleted',
    824001,null,null,'github-webhook:f2490000-0000-4000-8000-000000000002',true,'2026-08-25T01:06:00Z'
  )->>'status','pending','different trusted delete delivery is registered'
);
select lives_ok(
  $$select public.complete_github_webhook_installation(
    'f2490000-0000-4000-8000-000000000002',1,'revoked','2026-08-25T01:06:01Z'
  )$$,
  'different-delivery revoke replays safely'
);
select is((select revoked_at::text from public.github_installations where id='f2410000-0000-4000-8000-000000000001'),'2026-08-25 01:04:01+00','replay preserves first revoke timestamp');
select is((select count(*)::text from public.energy_ledger_entries where reservation_id='f2460000-0000-4000-8000-000000000001' and entry_type='released'),'1','replay emits no duplicate refund');

-- Out-of-order suspended/active observations cannot revive revoked.
select is(
  public.register_github_webhook_delivery(
    'f2490000-0000-4000-8000-000000000003',repeat('d',64),'installation','suspend',
    824001,null,null,'github-webhook:f2490000-0000-4000-8000-000000000003',true,'2026-08-25T01:07:00Z'
  )->>'status','pending','late suspend delivery is registered'
);
select lives_ok($$select public.complete_github_webhook_installation('f2490000-0000-4000-8000-000000000003',1,'suspended','2026-08-25T01:07:01Z')$$,'late suspended observation completes');
select is((select status from public.github_installations where id='f2410000-0000-4000-8000-000000000001'),'revoked','late suspended observation cannot revive revoked');

select is(
  public.register_github_webhook_delivery(
    'f2490000-0000-4000-8000-000000000004',repeat('e',64),'installation','unsuspend',
    824001,null,null,'github-webhook:f2490000-0000-4000-8000-000000000004',true,'2026-08-25T01:08:00Z'
  )->>'status','pending','late active delivery is registered'
);
select lives_ok($$select public.complete_github_webhook_installation('f2490000-0000-4000-8000-000000000004',1,'active','2026-08-25T01:08:01Z')$$,'late active observation completes');
select is((select status from public.github_installations where id='f2410000-0000-4000-8000-000000000001'),'revoked','late active observation cannot revive revoked');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f2400000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.reserve_project_brief_energy('f2430000-0000-4000-8000-000000000001','phase2:new-brief')$$,
  'P0001','project_brief_authorization_failed',
  'revoked installation rejects a new Brief before durable reservation'
);
reset role;
select is(
  (select count(*)::text from public.energy_reservations where request_key='phase2:new-brief'),
  '0','rejected Brief creates no reservation'
);

select results_eq(
  $$select
      (select status::text from public.github_installations where id='f2510000-0000-4000-8000-000000000002'),
      (select status::text from public.sync_runs where id='f2540000-0000-4000-8000-000000000002'),
      (select dispatch_status::text from public.project_sync_dispatches where id='f2550000-0000-4000-8000-000000000002'),
      (select status::text from public.energy_reservations where id='f2560000-0000-4000-8000-000000000002'),
      (select status::text from public.ai_invocations where id='f2570000-0000-4000-8000-000000000002')$$,
  $$values ('active'::text,'queued'::text,'pending'::text,'reserved'::text,'pending'::text)$$,
  'other user and installation remain byte-for-byte in their original states'
);
select is((select sum(delta)::text from public.energy_ledger_entries where user_id='f2500000-0000-4000-8000-000000000002'),'7','control Energy ledger delta remains unchanged');
select is((select sum(delta)::text from public.energy_ledger_entries where user_id='f2400000-0000-4000-8000-000000000001'),'10','target refund restores the pre-reservation balance');

select * from finish();
rollback;
