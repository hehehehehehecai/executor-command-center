-- logical_migration_id: 0008
-- contract_versions: github-installation-storage.v1,
--                    github-repository-list-failure.v1
-- purpose: expose only the current user's installation query fields to service_role

create function public.read_current_github_installation(p_user_id uuid)
returns table (
  installation_id bigint,
  repository_selection varchar(16),
  status varchar(16)
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    installation.installation_id,
    installation.repository_selection,
    installation.status
  from public.github_installations installation
  where installation.user_id = p_user_id
$$;

comment on function public.read_current_github_installation(uuid) is
  'Returns only repository-query fields for installations bound to one internal user.';

revoke all on function public.read_current_github_installation(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.read_current_github_installation(uuid)
to service_role;
