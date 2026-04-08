import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface GlobalPermissionFlags {
  isAdmin: boolean;
  canManageProjects: boolean;
  isOrgAdmin: boolean;
}

/**
 * GLOBAL permission flags from `profiles` + `org_members`.
 *
 * Three permission sources:
 * 1. profiles.is_admin — legacy global super-admin
 * 2. profiles.can_manage_projects — can create projects/scopes
 * 3. org_members.role IN ('owner','admin') — org-level admin
 *
 * isAdmin = profiles.is_admin OR org owner/admin
 * canManageProjects = profiles.can_manage_projects OR org owner/admin
 */
export const useGlobalPermissions = () => {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<GlobalPermissionFlags>({
    queryKey: ['profile-permissions', user?.id],
    queryFn: async (): Promise<GlobalPermissionFlags> => {
      const [profileRes, orgRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_admin, can_manage_projects')
          .eq('id', user!.id)
          .single(),
        supabase
          .from('org_members')
          .select('role')
          .eq('user_id', user!.id)
          .limit(1)
          .maybeSingle(),
      ]);

      const profile = profileRes.data;
      const profileError = profileRes.error;
      const orgMember = orgRes.data;

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      const isOrgAdmin = orgMember?.role === 'owner' || orgMember?.role === 'admin';

      return {
        isAdmin: (profile?.is_admin ?? false) || isOrgAdmin,
        canManageProjects: (profile?.can_manage_projects ?? false) || isOrgAdmin,
        isOrgAdmin,
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    isAdmin: data?.isAdmin ?? false,
    canManageProjects: data?.canManageProjects ?? false,
    isOrgAdmin: data?.isOrgAdmin ?? false,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load permissions') : null,
  };
};

/**
 * @deprecated Alias for useGlobalPermissions — use useGlobalPermissions directly.
 */
export const useAdmin = useGlobalPermissions;
