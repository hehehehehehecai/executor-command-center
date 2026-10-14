begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select col_is_null('public','projects','core_goal','core goal can be unconfirmed');
select col_is_null('public','projects','current_stage_goal','current stage goal can be unconfirmed');
select col_is_null('public','projects','status','official status can be unconfirmed');
select has_function('public','create_project_from_repository',array['uuid','uuid'],'restricted creation RPC exists');
select has_function('public','patch_project_context',array['uuid','uuid','jsonb'],'restricted patch RPC exists');
select ok(not has_function_privilege('anon','public.create_project_from_repository(uuid,uuid)','execute') and not has_function_privilege('authenticated','public.create_project_from_repository(uuid,uuid)','execute'),'ordinary users cannot execute creation RPC');
select ok(not has_function_privilege('anon','public.patch_project_context(uuid,uuid,jsonb)','execute') and not has_function_privilege('authenticated','public.patch_project_context(uuid,uuid,jsonb)','execute'),'ordinary users cannot execute patch RPC');
select ok(has_function_privilege('service_role','public.create_project_from_repository(uuid,uuid)','execute') and has_function_privilege('service_role','public.patch_project_context(uuid,uuid,jsonb)','execute'),'service role may invoke only guarded RPCs');
select ok(not has_table_privilege('authenticated','public.projects','insert') and not has_table_privilege('authenticated','public.projects','update') and not has_table_privilege('service_role','public.projects','update'),'no direct table write grant');
select ok(not has_function_privilege('service_role','app_private.lock_project_context_selection(uuid,uuid)','execute'),'private write gate is not a service-role escape hatch');

-- IDs and parent relationships for this deterministic regression family are
-- registered in the T03 journal before the guarded SQL suite starts. Rollback
-- retains no case rows; random project IDs produced by RPC are observations.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('c0300000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t03-sql-a@example.invalid','',now(),'{}','{}',now(),now()),
('c0300000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t03-sql-b@example.invalid','',now(),'{}','{}',now(),now());
insert into public.users(id) values ('c0300000-0000-4000-8000-000000000001'),('c0300000-0000-4000-8000-000000000002');
insert into public.github_installations(id,user_id,installation_id,github_account_id,github_account_login,account_type,repository_selection,status,last_verified_at) values
('c0310000-0000-4000-8000-000000000001','c0300000-0000-4000-8000-000000000001',93001001,93000001,'t03-a','User','selected','active',now()),
('c0310000-0000-4000-8000-000000000002','c0300000-0000-4000-8000-000000000002',93001002,93000002,'t03-b','User','selected','active',now());
insert into public.selected_repositories(id,user_id,github_installation_id,github_repository_id,owner_login,name,full_name,visibility,is_private,is_fork,is_archived,is_disabled,default_branch) values
('c0320000-0000-4000-8000-000000000001','c0300000-0000-4000-8000-000000000001','c0310000-0000-4000-8000-000000000001',93002001,'t03-a','one','t03-a/one','private',true,false,false,false,'main'),
('c0320000-0000-4000-8000-000000000002','c0300000-0000-4000-8000-000000000002','c0310000-0000-4000-8000-000000000002',93002002,'t03-b','two','t03-b/two','private',true,false,false,false,'main');

create temporary table t03_results(name text primary key, payload jsonb);
insert into t03_results values ('first',public.create_project_from_repository('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001'));
select is((select payload->'core_goal' from t03_results where name='first'),'null'::jsonb,'creation stores real null goal');
select is((select payload->'current_stage_goal' from t03_results where name='first'),'null'::jsonb,'creation stores real null stage');
select is((select payload->'status' from t03_results where name='first'),'null'::jsonb,'creation stores real null status');
select is(public.create_project_from_repository('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001'),(select payload from t03_results where name='first'),'duplicate creation returns the same complete row without timestamp writes');
select throws_ok($$insert into public.projects(user_id,selected_repository_id) values ('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001')$$,'23505',null,'null active project is protected by unique index');
select throws_ok($$select public.remove_selected_github_repository('c0300000-0000-4000-8000-000000000001',93002001)$$,'P0001','github_repository_selection_active_project_conflict','null project blocks deselection and cascading deletion');
select throws_ok($$select public.create_project_from_repository('c0300000-0000-4000-8000-000000000002','c0320000-0000-4000-8000-000000000001')$$,'P0002','project_context_not_found','foreign selection is indistinguishable from absent');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000002',(select (payload->>'id')::uuid from t03_results where name='first'),'{}')$$,'P0001','project_context_invalid_request','empty patch is rejected');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000002',(select (payload->>'id')::uuid from t03_results where name='first'),'{"coreGoal":null}')$$,'P0002','project_context_not_found','foreign project is indistinguishable from absent');

select lives_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"coreGoal":"保留目标","currentStageGoal":"保留阶段","status":"dormant","currentBlocker":"旧阻碍"}')$$,'all supplied fields update');
select lives_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"coreGoal":null,"currentBlocker":null}')$$,'explicit null clears only supplied fields');
select results_eq($$select core_goal,current_stage_goal,status,current_blocker from public.projects where selected_repository_id='c0320000-0000-4000-8000-000000000001'$$,$$values (null::text,'保留阶段'::text,'dormant'::text,null::text)$$,'omitted stage and status remain byte-for-byte');
select lives_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"status":null}')$$,'status can return to unconfirmed');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"coreGoal":" "}')$$,'P0001','project_context_invalid_request','blank goal refused');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),jsonb_build_object('coreGoal',repeat('🚀',1001)))$$,'P0001','project_context_invalid_request','UTF-16 length enforced by RPC');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"status":"invented"}')$$,'P0001','project_context_invalid_request','invalid enum refused');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"userId":"c0300000-0000-4000-8000-000000000002"}')$$,'P0001','project_context_invalid_request','owner injection refused');
select throws_ok($$select public.save_project_calibration('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001',null,'Stage','in_planning',null)$$,'23502','project_calibration_full_context_required','legacy RPC keeps mandatory full input');
insert into t03_results values ('filled',public.save_project_calibration('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001','旧完整目标','旧完整阶段','in_planning',null));
select is((select payload->>'id' from t03_results where name='filled'),(select payload->>'id' from t03_results where name='first'),'legacy full save fills the same null project ID');
select is((select count(*)::integer from public.projects where selected_repository_id='c0320000-0000-4000-8000-000000000001' and status is distinct from 'archived'),1,'legacy save did not create a second active project');

update public.github_installations set status='suspended',suspended_at=now() where id='c0310000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_project_from_repository('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001')$$,'P0001','project_context_authorization_unavailable','suspended installation fails closed');
update public.github_installations set status='revoked',suspended_at=null,revoked_at=now() where id='c0310000-0000-4000-8000-000000000001';
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"status":null}')$$,'P0001','project_context_authorization_unavailable','revoked installation fails closed');
update public.github_installations set status='active',suspended_at=null,revoked_at=null where id='c0310000-0000-4000-8000-000000000001';
update public.selected_repositories set is_disabled=true where id='c0320000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_project_from_repository('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001')$$,'P0001','project_context_repository_unavailable','disabled repository fails closed');
update public.selected_repositories set is_disabled=false where id='c0320000-0000-4000-8000-000000000001';
update public.projects set repository_data_state='removing' where id=(select (payload->>'id')::uuid from t03_results where name='first');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"status":null}')$$,'P0001','project_context_repository_unavailable','removing project fails closed');
update public.projects set repository_data_state='connected' where id=(select (payload->>'id')::uuid from t03_results where name='first');

select lives_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"status":"archived"}')$$,'active project may be archived');
create temporary table t03_archive as select * from public.projects where id=(select (payload->>'id')::uuid from t03_results where name='first');
select throws_ok($$select public.patch_project_context('c0300000-0000-4000-8000-000000000001',(select (payload->>'id')::uuid from t03_results where name='first'),'{"status":null}')$$,'P0001','project_context_archived','explicit null cannot restore archived history');
insert into t03_results values ('replacement',public.create_project_from_repository('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001'));
select isnt((select payload->>'id' from t03_results where name='replacement'),(select payload->>'id' from t03_results where name='first'),'archive permits a distinct replacement project');
select results_eq($$select to_jsonb(p) from public.projects p where p.id=(select id from t03_archive)$$,$$select to_jsonb(p) from t03_archive p$$,'archived row remains exactly unchanged');
select is((select count(*)::integer from public.sync_runs where project_id in(select id from public.projects where user_id='c0300000-0000-4000-8000-000000000001')),0,'creation and patches did not start synchronization');
select is((select count(*)::integer from public.project_sync_dispatches where project_id in(select id from public.projects where user_id='c0300000-0000-4000-8000-000000000001')),0,'no dispatch was enqueued');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.projects),0,'B cannot read A null/archived projects through RLS');
select throws_ok($$update public.projects set core_goal='forged'$$,'42501','permission denied for table projects','ordinary session cannot directly update nullable fields');
reset role;

select public.request_account_deletion('c0300000-0000-4000-8000-000000000001','t03-sql-account-delete','DELETE ACCOUNT c0300000-0000-4000-8000-000000000001');
select throws_ok($$select public.create_project_from_repository('c0300000-0000-4000-8000-000000000001','c0320000-0000-4000-8000-000000000001')$$,'P0001','project_context_account_unavailable','pending account deletion blocks even idempotent creation');
select * from finish();
rollback;
