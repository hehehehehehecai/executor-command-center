begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_table('public', 'users', 'users table exists');
select has_table(
  'public',
  'github_identities',
  'github_identities table exists'
);

select columns_are(
  'public',
  'users',
  array['id', 'created_at', 'updated_at'],
  'users columns match the identity contract'
);
select col_type_is('public', 'users', 'id', 'uuid', 'users.id is uuid');
select has_pk('public', 'users', 'users has a primary key');

select columns_are(
  'public',
  'github_identities',
  array[
    'id',
    'user_id',
    'github_user_id',
    'github_login',
    'avatar_url',
    'created_at',
    'updated_at'
  ],
  'github_identities columns match the identity contract'
);
select col_type_is(
  'public',
  'github_identities',
  'id',
  'uuid',
  'github_identities.id is uuid'
);
select col_type_is(
  'public',
  'github_identities',
  'github_user_id',
  'bigint',
  'github_user_id is bigint'
);
select col_type_is(
  'public',
  'github_identities',
  'github_login',
  'character varying(255)',
  'github_login has the documented database limit'
);
select has_pk(
  'public',
  'github_identities',
  'github_identities has an internal primary key'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.users'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'auth.users'::regclass
  $$,
  array[1::bigint],
  'users.id references auth.users'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_identities'::regclass
      and constraint_record.contype = 'f'
      and constraint_record.confrelid = 'public.users'::regclass
  $$,
  array[1::bigint],
  'github_identities.user_id references users'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_identities'::regclass
      and constraint_record.contype = 'u'
      and constraint_record.conkey = array[
        (
          select attribute_record.attnum
          from pg_attribute attribute_record
          where attribute_record.attrelid = 'public.github_identities'::regclass
            and attribute_record.attname = 'user_id'
        )
      ]::smallint[]
  $$,
  array[1::bigint],
  'user_id has its own unique constraint'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_identities'::regclass
      and constraint_record.contype = 'u'
      and constraint_record.conkey = array[
        (
          select attribute_record.attnum
          from pg_attribute attribute_record
          where attribute_record.attrelid = 'public.github_identities'::regclass
            and attribute_record.attname = 'github_user_id'
        )
      ]::smallint[]
  $$,
  array[1::bigint],
  'github_user_id has its own unique constraint'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_identities'::regclass
      and constraint_record.contype = 'u'
      and constraint_record.conkey = array[
        (
          select attribute_record.attnum
          from pg_attribute attribute_record
          where attribute_record.attrelid = 'public.github_identities'::regclass
            and attribute_record.attname = 'github_login'
        )
      ]::smallint[]
  $$,
  array[0::bigint],
  'github_login is not an identity uniqueness key'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.github_identities'::regclass
      and constraint_record.contype = 'c'
      and pg_get_constraintdef(constraint_record.oid) ilike '%github_user_id > 0%'
  $$,
  array[1::bigint],
  'github_user_id has a positive-value check constraint'
);

select results_eq(
  $$
    select relation_record.relrowsecurity
    from pg_class relation_record
    where relation_record.oid = 'public.users'::regclass
  $$,
  array[true],
  'users has RLS enabled'
);
select results_eq(
  $$
    select relation_record.relrowsecurity
    from pg_class relation_record
    where relation_record.oid = 'public.github_identities'::regclass
  $$,
  array[true],
  'github_identities has RLS enabled'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.users',
    'insert,update,delete'
  ),
  'authenticated cannot write users directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.github_identities',
    'insert,update,delete'
  ),
  'authenticated cannot write github_identities directly'
);

select * from finish();

rollback;
