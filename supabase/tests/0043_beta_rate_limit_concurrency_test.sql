begin;
create extension if not exists dblink with schema extensions;
select no_plan();

select extensions.dblink_connect(
  'beta_rate_' || n,
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
)
from generate_series(1,8) n;
select extensions.dblink_connect(
  'beta_rate_cleanup',
  'dbname=postgres host=host.docker.internal port=54322 user=postgres password=postgres'
);

-- The concurrent calls below commit in their independent dblink sessions, so
-- the enclosing pgTAP rollback cannot clean this synthetic subject. Remove only
-- this fixture's persisted bucket to keep the file repeatable in a shared test
-- database (for example, db:test followed by test:integration).
select extensions.dblink_exec(
  'beta_rate_cleanup',
  $$delete from app_private.beta_rate_limit_buckets
    where subject_fingerprint = extensions.digest(
      '10000000-0000-4000-8000-000000000101',
      'sha256'
    )
      and scope = 'project_brief_generate'$$
);

select is(
  extensions.dblink_send_query(
    'beta_rate_' || n,
    $$with claims as materialized (
      select pg_catalog.set_config(
        'request.jwt.claims',
        '{"sub":"10000000-0000-4000-8000-000000000101","role":"authenticated"}',
        false
      ) value
    )
    select result.allowed
    from claims
    cross join lateral public.consume_beta_rate_limit(
      'project_brief_generate' || pg_catalog.substr(claims.value, 1, 0)
    ) result$$
  ),
  1,
  'concurrent request ' || n || ' was dispatched'
)
from generate_series(1,8) n;

create temporary table beta_rate_results(connection_id integer primary key, allowed boolean not null);
insert into beta_rate_results(connection_id, allowed)
select n, result.allowed
from generate_series(1,8) n
cross join lateral extensions.dblink_get_result('beta_rate_' || n) as result(allowed boolean);

select is((select count(*) from beta_rate_results where allowed), 5::bigint,
  'exactly the fixed limit wins under real concurrent connections');
select is((select count(*) from beta_rate_results where not allowed), 3::bigint,
  'concurrent overflow is denied without overshoot');
select is((select count(*) from app_private.beta_rate_limit_buckets), 1::bigint,
  'one subject and scope produce one authoritative bucket');
select ok(not (
  select result.allowed
  from extensions.dblink(
    'beta_rate_cleanup',
    $$with claims as materialized (
      select pg_catalog.set_config(
        'request.jwt.claims',
        '{"sub":"10000000-0000-4000-8000-000000000101","role":"authenticated"}',
        false
      ) value
    )
    select rate.allowed
    from claims
    cross join lateral public.consume_beta_rate_limit(
      'project_brief_generate' || pg_catalog.substr(claims.value, 1, 0)
    ) rate$$
  ) as result(allowed boolean)
),
  'a same-window replay remains denied without a duplicate side effect');
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000102","role":"authenticated"}',
  true
);
select ok((select allowed from public.consume_beta_rate_limit('project_brief_generate')),
  'an unrelated subject is not blocked by the first subject');
select is((select count(*) from app_private.beta_rate_limit_buckets), 2::bigint,
  'cross-subject control creates an independent bucket');

select extensions.dblink_exec(
  'beta_rate_cleanup',
  $$delete from app_private.beta_rate_limit_buckets
    where subject_fingerprint = extensions.digest(
      '10000000-0000-4000-8000-000000000101',
      'sha256'
    )
      and scope = 'project_brief_generate'$$
);

select extensions.dblink_disconnect('beta_rate_' || n) from generate_series(1,8) n;
select extensions.dblink_disconnect('beta_rate_cleanup');
select * from finish();
rollback;
