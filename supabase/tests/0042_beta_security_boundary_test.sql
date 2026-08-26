begin;
select plan(15);

select has_function('public', 'consume_beta_rate_limit', array['text'],
  'rate limit RPC exists');
select has_table('app_private', 'beta_rate_limit_buckets',
  'authoritative buckets stay outside the exposed public schema');
select ok(not has_table_privilege('anon', 'app_private.beta_rate_limit_buckets', 'select'),
  'anon has no direct bucket privilege');
select ok(not has_table_privilege('authenticated', 'app_private.beta_rate_limit_buckets', 'select'),
  'authenticated has no direct bucket privilege');
select ok(not has_table_privilege('service_role', 'app_private.beta_rate_limit_buckets', 'select'),
  'service role has no direct bucket privilege');
select ok(not has_function_privilege('anon', 'public.consume_beta_rate_limit(text)', 'execute'),
  'anon cannot execute the authenticated rate gate');
select ok(has_function_privilege('authenticated', 'public.consume_beta_rate_limit(text)', 'execute'),
  'authenticated may execute only the bounded gate');
select ok(not has_function_privilege('service_role', 'public.consume_beta_rate_limit(text)', 'execute'),
  'service role is not an alternate subject for this gate');
select ok((select p.prosecdef and pg_catalog.array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='consume_beta_rate_limit'),
  'gate is SECURITY DEFINER with an empty search_path');
select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
), 'every public table has RLS enabled');
select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema='public' and grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER')
), 'anon has no public table mutation privilege');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select * from public.consume_beta_rate_limit('project_brief_generate')$$,
  'first authenticated subject can consume an allowed slot');
select ok((select bool_and(allowed) from generate_series(1,4) n,
  lateral public.consume_beta_rate_limit('project_brief_generate' || pg_catalog.substr(n::text,1,0))),
  'remaining in-window requests are allowed through the fixed limit');
select ok(not (select allowed from public.consume_beta_rate_limit('project_brief_generate')),
  'request beyond the fixed limit is denied atomically');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok((select allowed from public.consume_beta_rate_limit('project_brief_generate')),
  'a different authenticated subject has an independent bucket');

select * from finish();
rollback;
