begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public', 'fail_project_brief_generation',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text',
        'integer', 'integer', 'integer'],
  'failure finalization accepts the Evidence fingerprint used by the Provider attempt'
);

select function_privs_are(
  'public', 'fail_project_brief_generation',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text',
        'integer', 'integer', 'integer'],
  'service_role', array['EXECUTE'],
  'only the trusted server role can persist failed invocation observations'
);

select function_privs_are(
  'public', 'fail_project_brief_generation',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text',
        'integer', 'integer', 'integer'],
  'service_role', array[]::text[],
  'the legacy failure path without an Evidence fingerprint is disabled'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'f9000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'phase10-observation@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.users (id) values ('f9000000-0000-4000-8000-000000000001');
insert into public.github_identities (user_id, github_user_id, github_login)
values ('f9000000-0000-4000-8000-000000000001', 999101, 'phase10-observation');
insert into public.github_installations (
  id, user_id, installation_id, github_account_id, github_account_login,
  account_type, repository_selection, status, last_verified_at
) values (
  'f9100000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000001',
  999201, 999101, 'phase10-observation', 'User', 'selected', 'active', now()
);
select public.ensure_selected_github_repository(
  'f9000000-0000-4000-8000-000000000001',
  'f9100000-0000-4000-8000-000000000001',
  999301, 'phase10-observation', 'observation', 'phase10-observation/observation',
  'private', true, false, false, false, 'main'
);
select public.save_project_calibration(
  'f9000000-0000-4000-8000-000000000001',
  (select id from public.selected_repositories where github_repository_id = 999301),
  'Phase 10 observation', 'Persist safe failure lineage', 'in_development', null
);

insert into public.energy_reservations (
  id, user_id, project_id, business_date, request_key, amount, status
) values (
  'f9200000-0000-4000-8000-000000000001',
  'f9000000-0000-4000-8000-000000000001',
  (select id from public.projects where user_id = 'f9000000-0000-4000-8000-000000000001'),
  date '2026-08-21', 'phase10-observation-failure', 3, 'reserved'
);

select public.fail_project_brief_generation(
  'f9000000-0000-4000-8000-000000000001',
  'f9200000-0000-4000-8000-000000000001',
  'provider', 'project_brief_parse_failure',
  'deepseek', 'deepseek-chat', 'provider-request-safe', repeat('a', 64),
  12, 0, 125
);

select is(
  (
    select input_fingerprint
    from public.ai_invocations
    where reservation_id = 'f9200000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  'failed Provider invocation persists its Evidence fingerprint'
);

select is(
  (
    select cost_microunits
    from public.ai_invocations
    where reservation_id = 'f9200000-0000-4000-8000-000000000001'
  ),
  null::bigint,
  'unknown Provider cost remains null rather than being guessed'
);

select * from finish();
rollback;
