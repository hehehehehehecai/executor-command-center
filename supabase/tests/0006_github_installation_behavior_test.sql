begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'phase3-a@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'phase3-b@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.users (id)
values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.github_identities (user_id, github_user_id, github_login)
values
  ('11111111-1111-4111-8111-111111111111', 71001, 'fixture-user-a'),
  ('22222222-2222-4222-8222-222222222222', 71002, 'fixture-user-b');

select lives_ok(
  $$
    select public.create_github_installation_state(
      '11111111-1111-4111-8111-111111111111',
      repeat('a', 64),
      '/onboarding?step=installation',
      now() + interval '10 minutes'
    )
  $$,
  'a valid ten-minute hash-only state can be created'
);
select throws_ok(
  $$
    select public.consume_github_installation_state(
      null,
      repeat('a', 64)
    )
  $$,
  'P0001',
  'installation_state_wrong_user',
  'a null user cannot consume another user state'
);
select results_eq(
  $$
    select state_hash
    from public.github_installation_states
    where state_hash = repeat('a', 64)
  $$,
  array[repeat('a', 64)],
  'only the SHA-256-shaped state hash is stored'
);
select results_eq(
  $$
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'github_installation_states'
      and column_name in ('state', 'raw_state')
  $$,
  array[0::bigint],
  'the state table has no raw-state column'
);
select ok(
  (
    select expires_at > created_at
      and expires_at <= created_at + interval '10 minutes'
    from public.github_installation_states
    where state_hash = repeat('a', 64)
  ),
  'the stored state TTL is at most ten minutes'
);
select throws_ok(
  $$
    select public.create_github_installation_state(
      '11111111-1111-4111-8111-111111111111',
      repeat('d', 64),
      '//evil.example/path',
      now() + interval '10 minutes'
    )
  $$,
  '22023',
  'unsafe_installation_return_to',
  'an unsafe return path is rejected'
);
select results_eq(
  $$
    select public.consume_github_installation_state(
      '11111111-1111-4111-8111-111111111111',
      repeat('a', 64)
    )
  $$,
  array['/onboarding?step=installation'::text],
  'the owning user can consume a valid state'
);
select ok(
  (
    select consumed_at is not null
    from public.github_installation_states
    where state_hash = repeat('a', 64)
  ),
  'successful state consumption is recorded'
);
select throws_ok(
  $$
    select public.consume_github_installation_state(
      '11111111-1111-4111-8111-111111111111',
      repeat('a', 64)
    )
  $$,
  'P0001',
  'installation_state_replayed',
  'a consumed state cannot be replayed'
);

select lives_ok(
  $$
    select public.create_github_installation_state(
      '11111111-1111-4111-8111-111111111111',
      repeat('b', 64),
      '/onboarding',
      now() + interval '10 minutes'
    )
  $$,
  'a second user-bound state can be created'
);
select throws_ok(
  $$
    select public.consume_github_installation_state(
      '22222222-2222-4222-8222-222222222222',
      repeat('b', 64)
    )
  $$,
  'P0001',
  'installation_state_wrong_user',
  'another user cannot consume the state'
);
select results_eq(
  $$
    select public.consume_github_installation_state(
      '11111111-1111-4111-8111-111111111111',
      repeat('b', 64)
    )
  $$,
  array['/onboarding'::text],
  'a cross-user attempt does not burn the owning user state'
);

insert into public.github_installation_states (
  user_id,
  state_hash,
  return_to,
  expires_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  repeat('c', 64),
  '/onboarding',
  now() - interval '1 second'
);
select throws_ok(
  $$
    select public.consume_github_installation_state(
      '11111111-1111-4111-8111-111111111111',
      repeat('c', 64)
    )
  $$,
  'P0001',
  'installation_state_expired',
  'an expired state cannot be consumed'
);

create temporary table first_registration as
select public.register_verified_github_installation(
  '11111111-1111-4111-8111-111111111111',
  81001,
  71001,
  'fixture-user-a',
  'User',
  'selected',
  'active',
  null,
  '2026-07-23T06:00:00Z'::timestamptz
) as id;

select results_eq(
  $$select count(*)::bigint from public.github_installations$$,
  array[1::bigint],
  'first verified registration creates one record'
);
select results_eq(
  $$
    select installation_id || '|' || github_account_id || '|' || status
    from public.github_installations
  $$,
  array['81001|71001|active'::text],
  'first registration stores the verified external keys and status'
);
select results_eq(
  $$
    select public.register_verified_github_installation(
      '11111111-1111-4111-8111-111111111111',
      81001,
      71001,
      'fixture-user-a-renamed',
      'User',
      'all',
      'suspended',
      '2026-07-23T06:30:00Z'::timestamptz,
      '2026-07-23T07:00:00Z'::timestamptz
    )
  $$,
  array[(select id from first_registration)],
  'repeat registration returns the same internal record id'
);
select results_eq(
  $$
    select github_account_login || '|' || repository_selection || '|' || status
    from public.github_installations
  $$,
  array['fixture-user-a-renamed|all|suspended'::text],
  'repeat registration refreshes display fields and status'
);
select results_eq(
  $$select count(*)::bigint from public.github_installations$$,
  array[1::bigint],
  'repeat registration remains idempotent'
);
select results_eq(
  $$
    select public.register_verified_github_installation(
      '11111111-1111-4111-8111-111111111111',
      81002,
      71001,
      'fixture-user-a-renamed',
      'User',
      'selected',
      'active',
      null,
      '2026-07-23T08:00:00Z'::timestamptz
    )
  $$,
  array[(select id from first_registration)],
  'reinstall with a new installation id preserves the internal record id'
);
select results_eq(
  $$select installation_id from public.github_installations$$,
  array[81002::bigint],
  'reinstall replaces the stable external installation id'
);
select results_eq(
  $$select count(*)::bigint from public.github_installations$$,
  array[1::bigint],
  'reinstall does not create a second current installation'
);
select throws_ok(
  $$
    select public.register_verified_github_installation(
      '22222222-2222-4222-8222-222222222222',
      81002,
      71002,
      'fixture-user-b',
      'User',
      'all',
      'active',
      null,
      '2026-07-23T08:00:00Z'::timestamptz
    )
  $$,
  'P0001',
  'github_installation_already_bound',
  'another user cannot claim an existing installation id'
);
select results_eq(
  $$select user_id from public.github_installations where installation_id = 81002$$,
  array['11111111-1111-4111-8111-111111111111'::uuid],
  'cross-user claim preserves the original binding'
);
select throws_ok(
  $$
    select public.register_verified_github_installation(
      '22222222-2222-4222-8222-222222222222',
      82002,
      71001,
      'forged-account',
      'User',
      'all',
      'active',
      null,
      '2026-07-23T08:00:00Z'::timestamptz
    )
  $$,
  'P0001',
  'installation_account_mismatch',
  'database registration rechecks the current identity account id'
);
select results_eq(
  $$select count(*)::bigint from public.github_installations where installation_id = 82002$$,
  array[0::bigint],
  'account mismatch leaves no partial installation write'
);
select results_eq(
  $$select status from public.github_installations where installation_id = 81002$$,
  array['active'::varchar],
  'a valid active re-verification clears suspension'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.github_installations
    where revoked_at is not null
  $$,
  array[0::bigint],
  'setup registration never writes revoked status'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.github_installations
    where user_id = '11111111-1111-4111-8111-111111111111'
      and github_account_id = 71001
  $$,
  array[1::bigint],
  'the ownership key has exactly one current record'
);

select * from finish();

rollback;
