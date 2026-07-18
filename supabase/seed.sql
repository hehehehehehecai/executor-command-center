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
