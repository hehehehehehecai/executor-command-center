-- logical_migration_id: 0001
-- contract_version: database-baseline.v1
-- purpose: local migration-first rebuild sentinel

create extension if not exists pgtap with schema extensions;

create schema if not exists app_private;

comment on schema app_private is
  'Private application schema. It is not exposed to anonymous or authenticated clients.';

revoke all on schema app_private from public, anon, authenticated;

create table app_private.database_baseline (
  id text primary key,
  logical_migration_id text not null,
  contract_version text not null,
  seed_marker text not null,
  created_at timestamptz not null default now(),
  constraint database_baseline_id_check
    check (id = 'executor-command-center'),
  constraint database_baseline_logical_migration_id_check
    check (logical_migration_id = '0001'),
  constraint database_baseline_contract_version_check
    check (contract_version = 'database-baseline.v1'),
  constraint database_baseline_seed_marker_check
    check (seed_marker = 'local-seed-v1')
);

comment on table app_private.database_baseline is
  'Migration, seed, and recovery verification sentinel only; not a user, project, or product business model.';

revoke all on table app_private.database_baseline from public, anon, authenticated;
