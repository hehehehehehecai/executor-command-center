begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_schema(
  'app_private',
  'app_private schema exists'
);

select has_table(
  'app_private',
  'database_baseline',
  'database_baseline table exists'
);

select columns_are(
  'app_private',
  'database_baseline',
  array['id', 'logical_migration_id', 'contract_version', 'seed_marker', 'created_at'],
  'database_baseline columns match the contract'
);

select has_pk(
  'app_private',
  'database_baseline',
  'database_baseline has a primary key'
);

select results_eq(
  $$select count(*)::bigint from app_private.database_baseline$$,
  array[1::bigint],
  'database_baseline contains exactly one row'
);

select results_eq(
  $$select id from app_private.database_baseline$$,
  array['executor-command-center'::text],
  'baseline id matches the contract'
);

select results_eq(
  $$select logical_migration_id from app_private.database_baseline$$,
  array['0001'::text],
  'logical migration id matches the contract'
);

select results_eq(
  $$select contract_version from app_private.database_baseline$$,
  array['database-baseline.v1'::text],
  'contract version matches the contract'
);

select results_eq(
  $$select seed_marker from app_private.database_baseline$$,
  array['local-seed-v1'::text],
  'seed marker matches the contract'
);

select ok(
  not has_schema_privilege('anon', 'app_private', 'usage'),
  'anon has no app_private usage privilege'
);

select ok(
  not has_schema_privilege('authenticated', 'app_private', 'usage'),
  'authenticated has no app_private usage privilege'
);

select ok(
  not has_table_privilege(
    'anon',
    'app_private.database_baseline',
    'select,insert,update,delete'
  ),
  'anon has no database_baseline CRUD privilege'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'app_private.database_baseline',
    'select,insert,update,delete'
  ),
  'authenticated has no database_baseline CRUD privilege'
);

insert into app_private.database_baseline (
  id,
  logical_migration_id,
  contract_version,
  seed_marker
)
values (
  'executor-command-center',
  '0001',
  'database-baseline.v1',
  'local-seed-v1'
)
on conflict (id) do update
set
  logical_migration_id = excluded.logical_migration_id,
  contract_version = excluded.contract_version,
  seed_marker = excluded.seed_marker;

insert into app_private.database_baseline (
  id,
  logical_migration_id,
  contract_version,
  seed_marker
)
values (
  'executor-command-center',
  '0001',
  'database-baseline.v1',
  'local-seed-v1'
)
on conflict (id) do update
set
  logical_migration_id = excluded.logical_migration_id,
  contract_version = excluded.contract_version,
  seed_marker = excluded.seed_marker;

select results_eq(
  $$select count(*)::bigint from app_private.database_baseline$$,
  array[1::bigint],
  'replaying seed keeps exactly one baseline row'
);

select * from finish();

rollback;
