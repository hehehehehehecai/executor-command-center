create table app_private.beta_rate_limit_buckets (
  subject_fingerprint bytea not null,
  scope text not null constraint beta_rate_limit_scope_check check (scope in (
    'project_brief_generate',
    'project_brief_follow_up',
    'project_sync_mutation',
    'destructive_mutation',
    'project_configuration_mutation',
    'github_repository_mutation',
    'github_expensive_read'
  )),
  window_started_at timestamptz not null,
  request_count integer not null constraint beta_rate_limit_count_check check (request_count between 1 and 31),
  updated_at timestamptz not null,
  constraint beta_rate_limit_buckets_pkey primary key (subject_fingerprint, scope, window_started_at)
);

-- Historical default privileges left only REFERENCES/TRIGGER/TRUNCATE on these
-- identity and installation tables. No server adapter uses them directly; all
-- supported access is through bounded SECURITY DEFINER RPCs.
revoke all on table
  public.users,
  public.github_identities,
  public.github_installations,
  public.github_installation_states
from service_role;

comment on table app_private.beta_rate_limit_buckets is
  'Short-lived, hashed authenticated-subject counters for rate-limit.v1. No user profile, IP, request body, repository content, token, or secret is stored.';

revoke all on table app_private.beta_rate_limit_buckets from public, anon, authenticated, service_role;

create function public.consume_beta_rate_limit(p_scope text)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_fingerprint bytea;
  authoritative_now timestamptz := statement_timestamp();
  window_seconds integer;
  request_limit integer;
  window_start timestamptz;
  observed_count integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'rate_limit_unauthenticated';
  end if;
  select policy.request_limit, policy.window_seconds
  into request_limit, window_seconds
  from (values
    ('project_brief_generate', 5, 60),
    ('project_brief_follow_up', 20, 60),
    ('project_sync_mutation', 10, 60),
    ('destructive_mutation', 3, 3600),
    ('project_configuration_mutation', 30, 60),
    ('github_repository_mutation', 20, 60),
    ('github_expensive_read', 30, 60)
  ) as policy(scope, request_limit, window_seconds)
  where policy.scope = p_scope;
  if request_limit is null then
    raise exception using errcode = '22023', message = 'rate_limit_scope_invalid';
  end if;

  actor_fingerprint := extensions.digest(actor_id::text, 'sha256');
  window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from authoritative_now) / window_seconds) * window_seconds
  );

  delete from app_private.beta_rate_limit_buckets bucket
  where bucket.subject_fingerprint = actor_fingerprint
    and bucket.scope = p_scope
    and bucket.window_started_at < window_start;

  insert into app_private.beta_rate_limit_buckets(
    subject_fingerprint, scope, window_started_at, request_count, updated_at
  ) values (actor_fingerprint, p_scope, window_start, 1, authoritative_now)
  on conflict (subject_fingerprint, scope, window_started_at) do update
  set request_count = least(
        app_private.beta_rate_limit_buckets.request_count + 1,
        request_limit + 1
      ),
      updated_at = authoritative_now
  returning request_count into observed_count;

  return query select
    observed_count <= request_limit,
    greatest(request_limit - observed_count, 0),
    greatest(
      pg_catalog.ceil(extract(epoch from (
        window_start + pg_catalog.make_interval(secs => window_seconds) - authoritative_now
      )))::integer,
      1
    );
end;
$$;

comment on function public.consume_beta_rate_limit(text) is
  'rate-limit.v1 authenticated, database-time, atomic gate. Subject comes only from auth.uid(); scope selects fixed server policy.';

revoke all on function public.consume_beta_rate_limit(text) from public, anon, authenticated, service_role;
grant execute on function public.consume_beta_rate_limit(text) to authenticated;
