begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'd9000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'daily-grant-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'e9000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'daily-grant-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('d9000000-0000-4000-8000-000000000004'),
  ('e9000000-0000-4000-8000-000000000005');

insert into public.github_identities (user_id, github_user_id, github_login) values
  ('d9000000-0000-4000-8000-000000000004', 996004, 'daily-grant-a'),
  ('e9000000-0000-4000-8000-000000000005', 996005, 'daily-grant-b');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'd9100000-0000-4000-8000-000000000004',
    'd9000000-0000-4000-8000-000000000004',
    997004, 996004, 'daily-grant-a', 'User', 'selected', 'active', now()
  ),
  (
    'e9100000-0000-4000-8000-000000000005',
    'e9000000-0000-4000-8000-000000000005',
    997005, 996005, 'daily-grant-b', 'User', 'selected', 'active', now()
  );

select public.ensure_selected_github_repository(
  'd9000000-0000-4000-8000-000000000004',
  'd9100000-0000-4000-8000-000000000004',
  998004, 'daily-grant-a', 'alpha', 'daily-grant-a/alpha',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'e9000000-0000-4000-8000-000000000005',
  'e9100000-0000-4000-8000-000000000005',
  998005, 'daily-grant-b', 'beta', 'daily-grant-b/beta',
  'private', true, false, false, false, 'main'
);

select public.save_project_calibration(
  'd9000000-0000-4000-8000-000000000004',
  (select id from public.selected_repositories where github_repository_id = 998004),
  'Daily grant A', 'Phase 10.3', 'in_development', null
);
select public.save_project_calibration(
  'e9000000-0000-4000-8000-000000000005',
  (select id from public.selected_repositories where github_repository_id = 998005),
  'Daily grant B', 'Phase 10.3', 'in_development', null
);

select throws_ok(
  $$select public.reserve_project_brief_energy(
    (select id from public.projects where user_id = 'd9000000-0000-4000-8000-000000000004'),
    'brief:daily:unauthenticated'
  )$$,
  'P0001', 'energy_unauthenticated',
  'daily grant and reserve fails closed without auth.uid'
);

select set_config(
  'test.daily_grant_project_b_id',
  (select id::text from public.projects where user_id = 'e9000000-0000-4000-8000-000000000005'),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select result ->> 'outcome', result ->> 'amount', result ->> 'available_after',
           result ->> 'business_date'
    from (
      select public.reserve_project_brief_energy(
        (select id from public.projects), 'brief:daily:first'
      ) result
    ) reserved
  $$,
  $$values ('reserved', '3', '7', ((clock_timestamp() at time zone 'UTC')::date)::text)$$,
  'first cache miss atomically grants ten and reserves the fixed three on the database UTC date'
);

select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.reserve_project_brief_energy(
        (select id from public.projects), 'brief:daily:first'
      ) result
    ) replayed
  $$,
  array['replayed'],
  'same request replays without another grant or reservation'
);

select results_eq(
  $$
    select
      count(*) filter (where entry_type = 'grant')::bigint,
      count(*) filter (where entry_type = 'reserved')::bigint,
      sum(delta)::bigint
    from public.energy_ledger_entries
    where user_id = 'd9000000-0000-4000-8000-000000000004'
      and business_date = (clock_timestamp() at time zone 'UTC')::date
  $$,
  $$values (1::bigint, 1::bigint, 7::bigint)$$,
  'the append-only ledger contains exactly one daily grant and one reserve debit'
);

select throws_ok(
  $$select public.reserve_project_brief_energy(
    current_setting('test.daily_grant_project_b_id')::uuid,
    'brief:daily:forged'
  )$$,
  'P0001', 'energy_project_forbidden',
  'current user cannot grant or reserve against another user project'
);

select ok(
  has_function_privilege('authenticated', 'public.reserve_project_brief_energy(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'public.reserve_project_brief_energy(uuid,text)', 'execute')
    and not has_function_privilege('service_role', 'public.reserve_project_brief_energy(uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.reserve_energy(uuid,date,text,integer)', 'execute'),
  'only authenticated may execute the fixed entrypoint and the arbitrary date/amount RPC is not public'
);

select ok(
  exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and proname = 'reserve_project_brief_energy'
      and prosecdef
      and proconfig = array['search_path=""']::text[]
  ),
  'fixed entrypoint is SECURITY DEFINER with an empty search_path'
);

select * from finish();
rollback;
