begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('c0500000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t05-sql@example.invalid','',now(),'{}','{}',now(),now());
insert into public.users(id) values('c0500000-0000-4000-8000-000000000001');
insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at)
values('c0510000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000001',95001001,95000001,'t05-sql','User','selected','active',now());
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
values('c0520000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000001','c0510000-0000-4000-8000-000000000001',95002001,'t05-sql','repo-1','t05-sql/repo-1','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
values('c0530000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000001','c0520000-0000-4000-8000-000000000001',null,null,null);
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
values('c0520000-0000-4000-8000-000000000002','c0500000-0000-4000-8000-000000000001','c0510000-0000-4000-8000-000000000001',95002002,'t05-sql','repo-2','t05-sql/repo-2','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
values('c0530000-0000-4000-8000-000000000002','c0500000-0000-4000-8000-000000000001','c0520000-0000-4000-8000-000000000002',null,null,'in_planning');
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
values('c0520000-0000-4000-8000-000000000003','c0500000-0000-4000-8000-000000000001','c0510000-0000-4000-8000-000000000001',95002003,'t05-sql','repo-3','t05-sql/repo-3','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
values('c0530000-0000-4000-8000-000000000003','c0500000-0000-4000-8000-000000000001','c0520000-0000-4000-8000-000000000003',null,null,'in_development');
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
values('c0520000-0000-4000-8000-000000000004','c0500000-0000-4000-8000-000000000001','c0510000-0000-4000-8000-000000000001',95002004,'t05-sql','repo-4','t05-sql/repo-4','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
values('c0530000-0000-4000-8000-000000000004','c0500000-0000-4000-8000-000000000001','c0520000-0000-4000-8000-000000000004',null,null,'polishing');
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
values('c0520000-0000-4000-8000-000000000005','c0500000-0000-4000-8000-000000000001','c0510000-0000-4000-8000-000000000001',95002005,'t05-sql','repo-5','t05-sql/repo-5','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
values('c0530000-0000-4000-8000-000000000005','c0500000-0000-4000-8000-000000000001','c0520000-0000-4000-8000-000000000005',null,null,'dormant');
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
values('c0520000-0000-4000-8000-000000000006','c0500000-0000-4000-8000-000000000001','c0510000-0000-4000-8000-000000000001',95002006,'t05-sql','repo-6','t05-sql/repo-6','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
values('c0530000-0000-4000-8000-000000000006','c0500000-0000-4000-8000-000000000001','c0520000-0000-4000-8000-000000000006',null,null,'completed');
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch)
values('c0520000-0000-4000-8000-000000000007','c0500000-0000-4000-8000-000000000001','c0510000-0000-4000-8000-000000000001',95002007,'t05-sql','repo-7','t05-sql/repo-7','private',true,false,false,false,'main');
insert into public.projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status)
values('c0530000-0000-4000-8000-000000000007','c0500000-0000-4000-8000-000000000001','c0520000-0000-4000-8000-000000000007',null,null,'archived');
create function public.test_t05_payload(
  p_project_id uuid,
  p_fingerprint text,
  p_prompt_version text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'promptVersion', p_prompt_version,
    'schemaVersion', case when p_prompt_version='project-brief-v3' then 'project-brief-schema-v2' else 'project-brief-schema-v1' end,
    'projectId', p_project_id,
    'evidenceFingerprint', p_fingerprint,
    'rangeStart', '2026-08-01T00:00:00.000Z',
    'rangeEnd', '2026-08-18T00:00:00.000Z',
    'officialStatus', jsonb_build_object(
      'value', case when p_prompt_version='project-brief-v3' then null else 'in_development' end,
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
        'projectId', p_project_id
      ))
    ),
    'summary', jsonb_build_object(
      'text', 'Synthetic version contract.',
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
        'projectId', p_project_id
      ))
    ),
    'completedChanges', '[]'::jsonb,
    'ongoingWork', '[]'::jsonb,
    'openItems', '[]'::jsonb,
    'riskSignals', '[]'::jsonb,
    'unknowns', '[]'::jsonb,
    'evidenceRefs', jsonb_build_array(jsonb_build_object(
      'contractVersion', 'project-brief-evidence-source-ref.v1',
      'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
      'projectId', p_project_id
    )),
    'freshness', jsonb_build_object(
      'status', 'fresh',
      'evaluatedAt', '2026-08-18T00:00:00.000Z',
      'lastSuccessfulAt', '2026-08-18T00:00:00.000Z',
      'coverageComplete', true,
      'evidenceRefs', jsonb_build_array(jsonb_build_object(
        'contractVersion', 'project-brief-evidence-source-ref.v1',
        'sourceKind', 'project_profile', 'sourceId', 'phase10-6-profile',
        'projectId', p_project_id
      ))
    ),
    'boundaryNote',
      'This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility.'
  );
$$;

select results_eq(
$$select item->>'project_id' from jsonb_array_elements(public.list_reconciliation_projects('2026-09-01Z')) item order by 1$$,
$$values ('c0530000-0000-4000-8000-000000000001'::text),('c0530000-0000-4000-8000-000000000002'::text),('c0530000-0000-4000-8000-000000000003'::text),('c0530000-0000-4000-8000-000000000004'::text)$$,'reconciliation includes exactly null and the original three active states');
select is((select count(*)::integer from jsonb_array_elements(public.list_reconciliation_projects('2026-09-01Z')) item cross join jsonb_each(item->'local_facts') facts where length(facts.value#>>'{}')=64),24,'six canonical fact digests remain for each eligible project');
select ok(not has_function_privilege('authenticated','public.list_reconciliation_projects(timestamptz)','execute'),'session cannot bypass scheduled reconciliation RPC boundary');
select results_eq(
$$select pg_get_userbyid(proowner),prosecdef,proconfig[1]::text collate "default" from pg_proc where oid='public.list_reconciliation_projects(timestamptz)'::regprocedure$$,
$$values ('postgres'::name,true,'search_path=""'::text)$$,'reconciliation owner and SECURITY DEFINER path remain');
update public.github_installations set status='suspended',suspended_at=now(),revoked_at=null where id='c0510000-0000-4000-8000-000000000001';
select is((select count(*)::integer from jsonb_array_elements(public.list_reconciliation_projects('2026-09-01Z')) item where item->>'installation_status'='suspended'),4,'suspended mapping is retained for the existing use-case skip policy');
update public.github_installations set status='revoked',suspended_at=null,revoked_at=now() where id='c0510000-0000-4000-8000-000000000001';
select is((select count(*)::integer from jsonb_array_elements(public.list_reconciliation_projects('2026-09-01Z')) item where item->>'installation_status'='revoked'),4,'revoked mapping is retained for the existing use-case skip policy');
update public.github_installations set status='active',suspended_at=null,revoked_at=null where id='c0510000-0000-4000-8000-000000000001';
select is(public.request_project_sync('c0530000-0000-4000-8000-000000000001','reconciliation','t05-null-sync',null,now())->>'outcome','new','null status project reaches the existing sync dispatch path');
select is(public.request_project_sync('c0530000-0000-4000-8000-000000000001','reconciliation','t05-null-sync',null,now())->>'outcome','duplicate','same null project request is idempotent');
insert into public.energy_reservations(id,user_id,project_id,business_date,request_key,amount,status) values('c0540000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000001','c0530000-0000-4000-8000-000000000001',current_date,'t05-version-1',3,'reserved');
insert into public.energy_reservations(id,user_id,project_id,business_date,request_key,amount,status) values('c0540000-0000-4000-8000-000000000002','c0500000-0000-4000-8000-000000000001','c0530000-0000-4000-8000-000000000001',current_date,'t05-version-2',3,'reserved');
insert into public.energy_reservations(id,user_id,project_id,business_date,request_key,amount,status) values('c0540000-0000-4000-8000-000000000003','c0500000-0000-4000-8000-000000000001','c0530000-0000-4000-8000-000000000001',current_date,'t05-version-3',3,'reserved');
select lives_ok($$select public.finalize_project_brief_generation('c0500000-0000-4000-8000-000000000001','c0540000-0000-4000-8000-000000000001','2026-08-01Z','2026-08-18Z','project-brief-v3','project-brief-schema-v2',repeat('a',64),repeat('b',64),repeat('c',64),public.test_t05_payload('c0530000-0000-4000-8000-000000000001',repeat('a',64),'project-brief-v3'),clock_timestamp()+interval '1 day','synthetic','fixture','t05-v3-finalize',1,2,3)$$,'v3 schema-v2 finalizes through the real cache-equivalence wrapper');
select is((select payload->'officialStatus'->'value' from public.project_briefs where user_id='c0500000-0000-4000-8000-000000000001' and prompt_version='project-brief-v3'),'null'::jsonb,'new persisted official status remains JSON null');
select lives_ok($$select public.finalize_project_brief_generation('c0500000-0000-4000-8000-000000000001','c0540000-0000-4000-8000-000000000001','2026-08-01Z','2026-08-18Z','project-brief-v3','project-brief-schema-v2',repeat('a',64),repeat('b',64),repeat('c',64),public.test_t05_payload('c0530000-0000-4000-8000-000000000001',repeat('a',64),'project-brief-v3'),clock_timestamp()+interval '1 day','synthetic','fixture','t05-v3-finalize',1,2,3)$$,'v3 persistence replay remains safe');
select is((select count(*)::integer from public.project_briefs where user_id='c0500000-0000-4000-8000-000000000001' and prompt_version='project-brief-v3'),1,'replay creates exactly one brief');
select is((select count(*)::integer from public.ai_invocations where reservation_id='c0540000-0000-4000-8000-000000000001'),1,'replay creates exactly one invocation');
select lives_ok($$select public.fail_project_brief_generation_with_contract('c0500000-0000-4000-8000-000000000001','c0540000-0000-4000-8000-000000000002','schema_validation','project_brief_schema_validation_failed','synthetic','fixture','t05-v3-failure','project-brief-v3','project-brief-schema-v2',repeat('d',64),repeat('e',64),1,2,3)$$,'new failure contract releases the reservation atomically');
select is((select status from public.energy_reservations where id='c0540000-0000-4000-8000-000000000002'),'released','failed new response is not charged');
select results_eq($$select prompt_version,schema_version from public.ai_invocations where reservation_id='c0540000-0000-4000-8000-000000000002'$$,$$values ('project-brief-v3'::text,'project-brief-schema-v2'::text)$$,'failure receipt records the actual new version pair');
select throws_ok($$select public.fail_project_brief_generation_with_contract('c0500000-0000-4000-8000-000000000001','c0540000-0000-4000-8000-000000000003','provider','project_brief_provider_failure',null,null,null,'project-brief-v1','project-brief-schema-v2',repeat('f',64),repeat('a',64),null,null,null)$$,'P0001','project_brief_generation_invalid_request','reject version pair project-brief-v1/project-brief-schema-v2');
select throws_ok($$select public.fail_project_brief_generation_with_contract('c0500000-0000-4000-8000-000000000001','c0540000-0000-4000-8000-000000000003','provider','project_brief_provider_failure',null,null,null,'project-brief-v2','project-brief-schema-v2',repeat('f',64),repeat('a',64),null,null,null)$$,'P0001','project_brief_generation_invalid_request','reject version pair project-brief-v2/project-brief-schema-v2');
select throws_ok($$select public.fail_project_brief_generation_with_contract('c0500000-0000-4000-8000-000000000001','c0540000-0000-4000-8000-000000000003','provider','project_brief_provider_failure',null,null,null,'project-brief-v3','project-brief-schema-v1',repeat('f',64),repeat('a',64),null,null,null)$$,'P0001','project_brief_generation_invalid_request','reject version pair project-brief-v3/project-brief-schema-v1');
select throws_ok($$select public.fail_project_brief_generation_with_contract('c0500000-0000-4000-8000-000000000001','c0540000-0000-4000-8000-000000000003','provider','project_brief_provider_failure',null,null,null,'project-brief-v4','project-brief-schema-v2',repeat('f',64),repeat('a',64),null,null,null)$$,'P0001','project_brief_generation_invalid_request','reject version pair project-brief-v4/project-brief-schema-v2');
select is((select status from public.energy_reservations where id='c0540000-0000-4000-8000-000000000003'),'reserved','invalid pair cannot mutate reservation');
select * from finish();
rollback;
