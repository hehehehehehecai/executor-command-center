-- logical_migration_id: 0010
-- contract_version: github-activity-snapshots.v1
-- purpose: persist minimal typed GitHub activity snapshots with Project ownership

create table public.github_repository_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  github_object_id text not null,
  source_updated_at timestamptz not null,
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  repository_full_name text not null,
  default_branch text not null,
  visibility text not null,
  is_private boolean not null,
  is_fork boolean not null,
  is_archived boolean not null,
  is_disabled boolean not null,
  constraint github_repository_snapshots_project_object_key
    unique (project_id, github_object_id),
  constraint github_repository_snapshots_object_id_check check (
    github_object_id = btrim(github_object_id)
    and github_object_id <> ''
    and char_length(github_object_id) <= 255
  ),
  constraint github_repository_snapshots_source_version_check check (
    source_version = btrim(source_version)
    and source_version <> ''
    and char_length(source_version) <= 255
  ),
  constraint github_repository_snapshots_full_name_check check (
    repository_full_name = btrim(repository_full_name)
    and repository_full_name <> ''
    and char_length(repository_full_name) <= 512
  ),
  constraint github_repository_snapshots_default_branch_check check (
    default_branch = btrim(default_branch)
    and default_branch <> ''
    and char_length(default_branch) <= 255
  ),
  constraint github_repository_snapshots_visibility_check check (
    visibility in ('public', 'private', 'internal')
  )
);

create table public.github_commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  github_object_id text not null,
  source_updated_at timestamptz not null,
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  message text not null,
  authored_at timestamptz,
  committed_at timestamptz not null,
  author_login text,
  constraint github_commits_project_object_key
    unique (project_id, github_object_id),
  constraint github_commits_object_id_check check (
    github_object_id = btrim(github_object_id)
    and github_object_id <> ''
    and char_length(github_object_id) <= 255
  ),
  constraint github_commits_source_version_check check (
    source_version = btrim(source_version)
    and source_version <> ''
    and char_length(source_version) <= 255
  ),
  constraint github_commits_message_check check (
    message = btrim(message)
    and message <> ''
  ),
  constraint github_commits_author_login_check check (
    author_login is null
    or (
      author_login = btrim(author_login)
      and author_login <> ''
      and char_length(author_login) <= 255
    )
  )
);

create table public.github_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  github_object_id text not null,
  source_updated_at timestamptz not null,
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issue_number bigint not null,
  title text not null,
  state text not null,
  author_login text,
  closed_at timestamptz,
  constraint github_issues_project_object_key
    unique (project_id, github_object_id),
  constraint github_issues_object_id_check check (
    github_object_id = btrim(github_object_id)
    and github_object_id <> ''
    and char_length(github_object_id) <= 255
  ),
  constraint github_issues_source_version_check check (
    source_version = btrim(source_version)
    and source_version <> ''
    and char_length(source_version) <= 255
  ),
  constraint github_issues_number_check check (issue_number > 0),
  constraint github_issues_title_check check (
    title = btrim(title)
    and title <> ''
  ),
  constraint github_issues_state_check check (state in ('open', 'closed')),
  constraint github_issues_author_login_check check (
    author_login is null
    or (
      author_login = btrim(author_login)
      and author_login <> ''
      and char_length(author_login) <= 255
    )
  )
);

create table public.github_pull_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  github_object_id text not null,
  source_updated_at timestamptz not null,
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pull_request_number bigint not null,
  title text not null,
  state text not null,
  is_draft boolean not null,
  head_sha text not null,
  base_ref text not null,
  merged_at timestamptz,
  constraint github_pull_requests_project_object_key
    unique (project_id, github_object_id),
  constraint github_pull_requests_object_id_check check (
    github_object_id = btrim(github_object_id)
    and github_object_id <> ''
    and char_length(github_object_id) <= 255
  ),
  constraint github_pull_requests_source_version_check check (
    source_version = btrim(source_version)
    and source_version <> ''
    and char_length(source_version) <= 255
  ),
  constraint github_pull_requests_number_check check (
    pull_request_number > 0
  ),
  constraint github_pull_requests_title_check check (
    title = btrim(title)
    and title <> ''
  ),
  constraint github_pull_requests_state_check check (
    state in ('open', 'closed')
  ),
  constraint github_pull_requests_head_sha_check check (
    head_sha = btrim(head_sha)
    and head_sha <> ''
    and char_length(head_sha) <= 255
  ),
  constraint github_pull_requests_base_ref_check check (
    base_ref = btrim(base_ref)
    and base_ref <> ''
    and char_length(base_ref) <= 255
  )
);

create table public.github_releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  github_object_id text not null,
  source_updated_at timestamptz not null,
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tag_name text not null,
  name text,
  is_draft boolean not null,
  is_prerelease boolean not null,
  published_at timestamptz,
  constraint github_releases_project_object_key
    unique (project_id, github_object_id),
  constraint github_releases_object_id_check check (
    github_object_id = btrim(github_object_id)
    and github_object_id <> ''
    and char_length(github_object_id) <= 255
  ),
  constraint github_releases_source_version_check check (
    source_version = btrim(source_version)
    and source_version <> ''
    and char_length(source_version) <= 255
  ),
  constraint github_releases_tag_name_check check (
    tag_name = btrim(tag_name)
    and tag_name <> ''
    and char_length(tag_name) <= 255
  ),
  constraint github_releases_name_check check (
    name is null
    or (
      name = btrim(name)
      and name <> ''
    )
  )
);

create table public.github_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  github_object_id text not null,
  source_updated_at timestamptz not null,
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workflow_id text not null,
  run_number bigint not null,
  status text not null,
  conclusion text,
  event_name text not null,
  head_sha text not null,
  constraint github_workflow_runs_project_object_key
    unique (project_id, github_object_id),
  constraint github_workflow_runs_object_id_check check (
    github_object_id = btrim(github_object_id)
    and github_object_id <> ''
    and char_length(github_object_id) <= 255
  ),
  constraint github_workflow_runs_source_version_check check (
    source_version = btrim(source_version)
    and source_version <> ''
    and char_length(source_version) <= 255
  ),
  constraint github_workflow_runs_workflow_id_check check (
    workflow_id = btrim(workflow_id)
    and workflow_id <> ''
    and char_length(workflow_id) <= 255
  ),
  constraint github_workflow_runs_run_number_check check (run_number > 0),
  constraint github_workflow_runs_status_check check (
    status in ('queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending')
  ),
  constraint github_workflow_runs_conclusion_check check (
    conclusion is null
    or conclusion in (
      'success', 'failure', 'neutral', 'cancelled', 'skipped',
      'timed_out', 'action_required', 'stale', 'startup_failure'
    )
  ),
  constraint github_workflow_runs_event_name_check check (
    event_name = btrim(event_name)
    and event_name <> ''
    and char_length(event_name) <= 255
  ),
  constraint github_workflow_runs_head_sha_check check (
    head_sha = btrim(head_sha)
    and head_sha <> ''
    and char_length(head_sha) <= 255
  )
);

create table public.github_document_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  github_object_id text not null,
  source_updated_at timestamptz not null,
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  document_path text not null,
  document_kind text not null,
  content_fingerprint text not null,
  constraint github_document_snapshots_project_object_key
    unique (project_id, github_object_id),
  constraint github_document_snapshots_object_id_check check (
    github_object_id = btrim(github_object_id)
    and github_object_id <> ''
    and char_length(github_object_id) <= 255
  ),
  constraint github_document_snapshots_source_version_check check (
    source_version = btrim(source_version)
    and source_version <> ''
    and char_length(source_version) <= 255
  ),
  constraint github_document_snapshots_path_check check (
    document_path = btrim(document_path)
    and document_path <> ''
    and char_length(document_path) <= 4096
  ),
  constraint github_document_snapshots_kind_check check (
    document_kind in ('readme', 'documentation', 'configuration', 'other')
  ),
  constraint github_document_snapshots_fingerprint_check check (
    content_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  )
);

comment on table public.github_repository_snapshots is
  'Minimal repository fact snapshots. github_object_id is the stable GitHub repository ID; source_version identifies the observed source object version.';
comment on table public.github_commits is
  'Minimal commit snapshots. github_object_id is the immutable commit SHA; committed_at is the source time and source_version identifies the observed tree/version.';
comment on table public.github_issues is
  'Minimal issue snapshots. github_object_id is the stable GitHub issue object ID, not the mutable title or display number.';
comment on table public.github_pull_requests is
  'Minimal pull request snapshots. github_object_id is the stable pull request object ID; head_sha is mutable provenance, not identity.';
comment on table public.github_releases is
  'Minimal release snapshots. github_object_id is the stable GitHub release object ID.';
comment on table public.github_workflow_runs is
  'Minimal workflow run snapshots. github_object_id is the stable workflow run object ID.';
comment on table public.github_document_snapshots is
  'Metadata-only document snapshots. source_version and content_fingerprint identify content change without storing source, diffs, or raw API responses.';

create index github_repository_snapshots_project_source_idx
on public.github_repository_snapshots (project_id, source_updated_at desc, id);
create index github_commits_project_source_idx
on public.github_commits (project_id, source_updated_at desc, id);
create index github_issues_project_source_idx
on public.github_issues (project_id, source_updated_at desc, id);
create index github_pull_requests_project_source_idx
on public.github_pull_requests (project_id, source_updated_at desc, id);
create index github_releases_project_source_idx
on public.github_releases (project_id, source_updated_at desc, id);
create index github_workflow_runs_project_source_idx
on public.github_workflow_runs (project_id, source_updated_at desc, id);
create index github_document_snapshots_project_source_idx
on public.github_document_snapshots (project_id, source_updated_at desc, id);

create trigger github_repository_snapshots_set_updated_at
before update on public.github_repository_snapshots
for each row execute function app_private.set_updated_at();
create trigger github_commits_set_updated_at
before update on public.github_commits
for each row execute function app_private.set_updated_at();
create trigger github_issues_set_updated_at
before update on public.github_issues
for each row execute function app_private.set_updated_at();
create trigger github_pull_requests_set_updated_at
before update on public.github_pull_requests
for each row execute function app_private.set_updated_at();
create trigger github_releases_set_updated_at
before update on public.github_releases
for each row execute function app_private.set_updated_at();
create trigger github_workflow_runs_set_updated_at
before update on public.github_workflow_runs
for each row execute function app_private.set_updated_at();
create trigger github_document_snapshots_set_updated_at
before update on public.github_document_snapshots
for each row execute function app_private.set_updated_at();

alter table public.github_repository_snapshots enable row level security;
alter table public.github_commits enable row level security;
alter table public.github_issues enable row level security;
alter table public.github_pull_requests enable row level security;
alter table public.github_releases enable row level security;
alter table public.github_workflow_runs enable row level security;
alter table public.github_document_snapshots enable row level security;

revoke all on table public.github_repository_snapshots
from public, anon, authenticated, service_role;
revoke all on table public.github_commits
from public, anon, authenticated, service_role;
revoke all on table public.github_issues
from public, anon, authenticated, service_role;
revoke all on table public.github_pull_requests
from public, anon, authenticated, service_role;
revoke all on table public.github_releases
from public, anon, authenticated, service_role;
revoke all on table public.github_workflow_runs
from public, anon, authenticated, service_role;
revoke all on table public.github_document_snapshots
from public, anon, authenticated, service_role;

create policy github_repository_snapshots_select_own
on public.github_repository_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.projects project_record
    where project_record.id = github_repository_snapshots.project_id
      and project_record.user_id = (select auth.uid())
  )
);
create policy github_commits_select_own
on public.github_commits
for select to authenticated
using (
  exists (
    select 1 from public.projects project_record
    where project_record.id = github_commits.project_id
      and project_record.user_id = (select auth.uid())
  )
);
create policy github_issues_select_own
on public.github_issues
for select to authenticated
using (
  exists (
    select 1 from public.projects project_record
    where project_record.id = github_issues.project_id
      and project_record.user_id = (select auth.uid())
  )
);
create policy github_pull_requests_select_own
on public.github_pull_requests
for select to authenticated
using (
  exists (
    select 1 from public.projects project_record
    where project_record.id = github_pull_requests.project_id
      and project_record.user_id = (select auth.uid())
  )
);
create policy github_releases_select_own
on public.github_releases
for select to authenticated
using (
  exists (
    select 1 from public.projects project_record
    where project_record.id = github_releases.project_id
      and project_record.user_id = (select auth.uid())
  )
);
create policy github_workflow_runs_select_own
on public.github_workflow_runs
for select to authenticated
using (
  exists (
    select 1 from public.projects project_record
    where project_record.id = github_workflow_runs.project_id
      and project_record.user_id = (select auth.uid())
  )
);
create policy github_document_snapshots_select_own
on public.github_document_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.projects project_record
    where project_record.id = github_document_snapshots.project_id
      and project_record.user_id = (select auth.uid())
  )
);

grant select on table public.github_repository_snapshots to authenticated;
grant select on table public.github_commits to authenticated;
grant select on table public.github_issues to authenticated;
grant select on table public.github_pull_requests to authenticated;
grant select on table public.github_releases to authenticated;
grant select on table public.github_workflow_runs to authenticated;
grant select on table public.github_document_snapshots to authenticated;
