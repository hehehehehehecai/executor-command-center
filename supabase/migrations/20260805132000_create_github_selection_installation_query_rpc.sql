-- logical_migration_id: 0009
-- contract_versions: github-installation-storage.v1,
--                    github-repository-selection.v1
-- purpose: expose only the installation fields required by repository selection

create function public.read_current_github_selection_installation(
  p_user_id uuid
)
returns table (
  id uuid,
  installation_id bigint,
  status varchar(16)
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    installation.id,
    installation.installation_id,
    installation.status
  from public.github_installations installation
  where installation.user_id = p_user_id
$$;

comment on function public.read_current_github_selection_installation(uuid)
is 'Returns only repository-selection installation fields for one internal user.';

revoke all on function public.read_current_github_selection_installation(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.read_current_github_selection_installation(uuid)
to service_role;
