-- logical_migration_id: 0007
-- contract_versions: github-installation-storage.v1
-- purpose: expose only the current user's stable GitHub id to service_role

create function public.read_current_github_identity(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select identity.github_user_id
  from public.github_identities identity
  where identity.user_id = p_user_id
$$;

comment on function public.read_current_github_identity(uuid) is
  'Returns only the stable GitHub user id for one internal user.';

revoke all on function public.read_current_github_identity(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.read_current_github_identity(uuid)
to service_role;
