begin;
select no_plan();

select diag(format(
  'security inventory: public_tables=%s rls_enabled=%s policies=%s security_definer_functions=%s',
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
  (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef)
));
select diag(format(
  'service_role direct grants: %s',
  coalesce((select string_agg(table_name || ':' || privilege_type, ',' order by table_name, privilege_type)
    from information_schema.role_table_grants
    where table_schema='public' and grantee='service_role'), 'none')
));

select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
), 'all public tables enforce RLS');
select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
), 'anon has no direct public table privilege');
select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema='public' and grantee='authenticated'
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
), 'authenticated has no direct public table mutation privilege');
select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema='public' and grantee='service_role'
), 'service role has no direct public table privilege');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and coalesce(pg_catalog.array_to_string(p.proconfig, ','),'') not in ('search_path=', 'search_path=""')
), 'every public SECURITY DEFINER fixes an empty search_path');
select ok(not exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl on true
  where n.nspname='public' and p.prosecdef and acl.grantee=0 and acl.privilege_type='EXECUTE'
), 'PUBLIC cannot execute a public SECURITY DEFINER function');
select ok(not exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl on true
  where n.nspname='public' and p.prosecdef
    and acl.grantee=(select oid from pg_roles where rolname='anon')
    and acl.privilege_type='EXECUTE'
), 'anon cannot execute a public SECURITY DEFINER function');
select ok((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r') > 0, 'public table inventory denominator is non-zero');
select ok((select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') > 0,
  'RLS policy inventory denominator is non-zero');

select * from finish();
rollback;
