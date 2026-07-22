begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

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
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-a@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-b@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.users (id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.github_identities (user_id, github_user_id, github_login)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1001, 'rls-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1002, 'rls-b');

select policies_are(
  'public',
  'users',
  array['users_select_own'],
  'users exposes only the own-row read policy'
);
select policies_are(
  'public',
  'github_identities',
  array['github_identities_select_own'],
  'github_identities exposes only the own-row read policy'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.users$$,
  '42501',
  'permission denied for table users',
  'anonymous users cannot read internal users'
);
select throws_ok(
  $$select count(*) from public.github_identities$$,
  '42501',
  'permission denied for table github_identities',
  'anonymous users cannot read GitHub identities'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select results_eq(
  $$select id from public.users order by id$$,
  array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid],
  'User A can read only their internal user row'
);
select results_eq(
  $$select user_id from public.github_identities order by user_id$$,
  array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid],
  'User A can read only their GitHub identity row'
);
select results_eq(
  $$select count(*)::bigint from public.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array[0::bigint],
  'User A cannot read User B internal row'
);
select results_eq(
  $$select count(*)::bigint from public.github_identities where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  array[0::bigint],
  'User A cannot read User B GitHub identity row'
);
select throws_ok(
  $$update public.users set updated_at = now() where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  'permission denied for table users',
  'User A cannot update User B'
);
select throws_ok(
  $$delete from public.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '42501',
  'permission denied for table users',
  'User A cannot delete User B'
);
select throws_ok(
  $$
    insert into public.github_identities (user_id, github_user_id, github_login)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 9999, 'forged')
  $$,
  '42501',
  'permission denied for table github_identities',
  'authenticated clients cannot forge GitHub identity bindings'
);
reset role;

select ok(
  has_table_privilege('authenticated', 'public.users', 'select'),
  'authenticated has read access governed by RLS'
);

select * from finish();

rollback;
