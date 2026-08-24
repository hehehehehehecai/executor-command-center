begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Exercise the legacy generic primitive only inside this rolled-back database
-- contract test; production authenticated callers use reserve_project_brief_energy.
grant execute on function public.reserve_energy(uuid, date, text, integer) to authenticated;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a9000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'energy-a@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b9000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'energy-b@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('a9000000-0000-4000-8000-000000000001'),
  ('b9000000-0000-4000-8000-000000000002');

insert into public.github_identities (user_id, github_user_id, github_login) values
  ('a9000000-0000-4000-8000-000000000001', 990001, 'energy-user-a'),
  ('b9000000-0000-4000-8000-000000000002', 990002, 'energy-user-b');

insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values
  (
    'a9100000-0000-4000-8000-000000000001',
    'a9000000-0000-4000-8000-000000000001',
    991001, 990001, 'energy-user-a', 'User', 'selected', 'active', now()
  ),
  (
    'b9100000-0000-4000-8000-000000000002',
    'b9000000-0000-4000-8000-000000000002',
    991002, 990002, 'energy-user-b', 'User', 'selected', 'active', now()
  );

select public.ensure_selected_github_repository(
  'a9000000-0000-4000-8000-000000000001',
  'a9100000-0000-4000-8000-000000000001',
  992001, 'energy-a', 'alpha', 'energy-a/alpha',
  'private', true, false, false, false, 'main'
);
select public.ensure_selected_github_repository(
  'b9000000-0000-4000-8000-000000000002',
  'b9100000-0000-4000-8000-000000000002',
  992002, 'energy-b', 'beta', 'energy-b/beta',
  'private', true, false, false, false, 'main'
);

select public.save_project_calibration(
  'a9000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 992001),
  'Energy accounting', 'Phase 1', 'in_development', null
);
select public.save_project_calibration(
  'b9000000-0000-4000-8000-000000000002',
  (select id from public.selected_repositories where github_repository_id = 992002),
  'Other accounting', 'Phase 1', 'in_development', null
);

insert into public.energy_ledger_entries (
  user_id, business_date, idempotency_key, entry_type, amount, delta
) values
  (
    'a9000000-0000-4000-8000-000000000001',
    date '2026-08-18', 'daily-grant:a', 'grant', 10, 10
  ),
  (
    'b9000000-0000-4000-8000-000000000002',
    date '2026-08-18', 'daily-grant:b', 'grant', 4, 4
  );

select set_config(
  'test.energy_project_b_id',
  (select id::text from public.projects where user_id = 'b9000000-0000-4000-8000-000000000002'),
  true
);

select throws_ok(
  $$select public.reserve_energy(
    (select id from public.projects where user_id = 'a9000000-0000-4000-8000-000000000001'),
    date '2026-08-18', 'unauthenticated', 1
  )$$,
  'P0001', 'energy_unauthenticated',
  'reserve fails closed without an authenticated identity'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$select public.get_available_energy(date '2026-08-18')$$,
  array[10::bigint],
  'available energy is the deterministic sum of ledger deltas'
);
select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.reserve_energy(
        (select id from public.projects),
        date '2026-08-18', 'brief:first', 3
      ) as result
    ) reservation
  $$,
  array['reserved'],
  'reserve succeeds atomically'
);
select set_config(
  'test.energy_reservation_a_id',
  (select id::text from public.energy_reservations where request_key = 'brief:first'),
  true
);
select results_eq(
  $$select public.get_available_energy(date '2026-08-18')$$,
  array[7::bigint],
  'successful reserve immediately reduces available energy'
);
select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.reserve_energy(
        (select id from public.projects),
        date '2026-08-18', 'brief:first', 3
      ) as result
    ) reservation
  $$,
  array['replayed'],
  'same idempotency key and parameters replay the reservation'
);
select results_eq(
  $$
    select
      (select count(*)::bigint from public.energy_reservations where request_key = 'brief:first'),
      (select count(*)::bigint from public.energy_ledger_entries where entry_type = 'reserved')
  $$,
  $$values (1::bigint, 1::bigint)$$,
  'replay creates neither another reservation nor another ledger fact'
);
select throws_ok(
  $$select public.reserve_energy(
    (select id from public.projects), date '2026-08-18', 'brief:first', 4
  )$$,
  'P0001', 'energy_idempotency_conflict',
  'same idempotency key with different parameters fails closed'
);
select throws_ok(
  $$select public.reserve_energy(
    (select id from public.projects), date '2026-08-18', 'brief:too-large', 8
  )$$,
  'P0001', 'energy_insufficient_balance',
  'insufficient balance has a stable failure semantic'
);
select results_eq(
  $$
    select
      count(*) filter (where request_key = 'brief:too-large')::bigint,
      (select count(*)::bigint from public.energy_ledger_entries where idempotency_key like '%too-large%')
    from public.energy_reservations
  $$,
  $$values (0::bigint, 0::bigint)$$,
  'insufficient balance leaves no partial reservation or ledger fact'
);
select throws_ok(
  $$select public.reserve_energy(
    current_setting('test.energy_project_b_id')::uuid,
    date '2026-08-18', 'brief:forged', 1
  )$$,
  'P0001', 'energy_project_forbidden',
  'current identity cannot reserve for another user project'
);
select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.consume_energy(
        (select id from public.energy_reservations where request_key = 'brief:first')
      ) as result
    ) consumed
  $$,
  array['consumed'],
  'reserved energy transitions to consumed'
);
select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.consume_energy(
        (select id from public.energy_reservations where request_key = 'brief:first')
      ) as result
    ) consumed
  $$,
  array['replayed'],
  'consumed terminal transition replays idempotently'
);
select throws_ok(
  $$select public.release_energy(
    (select id from public.energy_reservations where request_key = 'brief:first')
  )$$,
  'P0001', 'energy_invalid_state',
  'consumed reservation cannot cross into released'
);

select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.reserve_energy(
        (select id from public.projects),
        date '2026-08-18', 'brief:release', 2
      ) as result
    ) reservation
  $$,
  array['reserved'],
  'a second reservation succeeds'
);
select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.release_energy(
        (select id from public.energy_reservations where request_key = 'brief:release')
      ) as result
    ) released
  $$,
  array['released'],
  'reserved energy transitions to released and is returned'
);
select results_eq(
  $$
    select result ->> 'outcome'
    from (
      select public.release_energy(
        (select id from public.energy_reservations where request_key = 'brief:release')
      ) as result
    ) released
  $$,
  array['replayed'],
  'released terminal transition replays idempotently'
);
select throws_ok(
  $$select public.consume_energy(
    (select id from public.energy_reservations where request_key = 'brief:release')
  )$$,
  'P0001', 'energy_invalid_state',
  'released reservation cannot cross into consumed'
);
select results_eq(
  $$select public.get_available_energy(date '2026-08-18')$$,
  array[7::bigint],
  'consume keeps the reserve debit and release restores its reserve debit'
);
select results_eq(
  $$
    select entry_type, count(*)::bigint
    from public.energy_ledger_entries
    where reservation_id is not null
    group by entry_type
    order by entry_type
  $$,
  $$
    values
      ('consumed'::text, 1::bigint),
      ('released'::text, 1::bigint),
      ('reserved'::text, 2::bigint)
  $$,
  'each reservation lifecycle event has exactly one immutable ledger fact'
);
select throws_ok(
  $$insert into public.energy_ledger_entries (
    user_id, business_date, idempotency_key, entry_type, amount, delta
  ) values (
    'a9000000-0000-4000-8000-000000000001', date '2026-08-18',
    'forged-grant', 'grant', 100, 100
  )$$,
  '42501', 'permission denied for table energy_ledger_entries',
  'authenticated clients cannot forge ledger facts'
);
select throws_ok(
  $$insert into public.project_briefs (
    user_id, project_id, range_start, range_end
  ) values (
    'a9000000-0000-4000-8000-000000000001',
    (select id from public.projects), now() - interval '1 day', now()
  )$$,
  '42501', 'permission denied for table project_briefs',
  'authenticated clients cannot create brief envelopes directly'
);
select results_eq(
  $$select count(*)::bigint from public.energy_ledger_entries$$,
  array[5::bigint],
  'RLS exposes only the current user ledger rows'
);
select results_eq(
  $$select count(*)::bigint from public.energy_reservations$$,
  array[2::bigint],
  'RLS exposes only the current user reservations'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"b9000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select results_eq(
  $$select count(*)::bigint from public.energy_ledger_entries$$,
  array[1::bigint],
  'another identity reads only its own ledger facts'
);
select results_eq(
  $$select count(*)::bigint from public.energy_reservations$$,
  array[0::bigint],
  'another identity cannot read reservations owned by the first user'
);
select throws_ok(
  $$select public.consume_energy(
    current_setting('test.energy_reservation_a_id')::uuid
  )$$,
  'P0001', 'energy_reservation_not_found',
  'another identity cannot operate a reservation owned by the first user'
);
select throws_ok(
  $$select public.consume_energy(
    (select id from public.energy_reservations where false)
  )$$,
  'P0001', 'energy_invalid_request',
  'null reservation input fails closed'
);
reset role;

select throws_ok(
  $$update public.energy_ledger_entries set metadata = '{"changed":true}'::jsonb$$,
  'P0001', 'energy_ledger_immutable',
  'ledger facts cannot be updated even through a privileged path'
);
select throws_ok(
  $$delete from public.energy_ledger_entries$$,
  'P0001', 'energy_ledger_immutable',
  'ledger facts cannot be deleted even through a privileged path'
);
select throws_ok(
  $$insert into public.project_briefs (
    user_id, project_id, range_start, range_end, status, payload, completed_at
  ) values (
    'a9000000-0000-4000-8000-000000000001',
    (select id from public.projects where user_id = 'a9000000-0000-4000-8000-000000000001'),
    now() - interval '1 day', now(), 'completed', '{"summary":"unvalidated"}'::jsonb, now()
  )$$,
  '23514', null,
  'completed brief cannot omit prompt, schema and evidence validation metadata'
);
select throws_ok(
  $$insert into public.ai_invocations (
    user_id, project_id, feature
  ) values (
    'a9000000-0000-4000-8000-000000000001',
    (select id from public.projects where user_id = 'b9000000-0000-4000-8000-000000000002'),
    'project_brief'
  )$$,
  '23503', null,
  'invocation ownership cannot be paired with another user project'
);
select throws_ok(
  $$insert into public.project_briefs (
    user_id, project_id, range_start, range_end
  ) values (
    'a9000000-0000-4000-8000-000000000001',
    (select id from public.projects where user_id = 'b9000000-0000-4000-8000-000000000002'),
    now() - interval '1 day', now()
  )$$,
  '23503', null,
  'brief ownership cannot be paired with another user project'
);

select * from finish();
rollback;
