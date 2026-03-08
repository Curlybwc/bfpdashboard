import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface GlobalPermissionFlags {
  isAdmin: boolean;
  canManageProjects: boolean;
}

/**
 * GLOBAL permission flags from the `profiles` table.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  ROLE MODEL — two independent layers:                              │
 * │                                                                    │
 * │  1. GLOBAL flags (this hook)                                       │
 * │     • isAdmin — full system access, all admin routes               │
 * │     • canManageProjects — can create projects/scopes, access       │
 * │       manager-only routes (field mode, walkthroughs, scopes)       │
 * │     → Used by: MobileNav, route guards (AdminGuard, ManagerGuard)  │
 * │                                                                    │
 * │  2. PROJECT-LEVEL roles (project_members.role)                     │
 * │     • 'manager' | 'contractor' | 'read_only'                      │
 * │     → Used by: ProjectDetail, TaskCard, permissions.ts helpers     │
 * │     → Determines per-project task visibility, actions, filtering   │
 * │                                                                    │
 * │  These layers are INDEPENDENT. A user with canManageProjects=true  │
 * │  still needs a project_members row to interact with a project.     │
 * │  isAdmin bypasses both layers.                                     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Backed by React Query — all consumers share a single cached fetch.
 */
export const useGlobalPermissions = () => {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<GlobalPermissionFlags>({
    queryKey: ['profile-permissions', user?.id],
    queryFn: async (): Promise<GlobalPermissionFlags> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin, can_manage_projects')
        .eq('id', user!.id)
        .single();

      if (error) {
        // Missing profile row → default permissions
        if (error.code === 'PGRST116') {
          return { isAdmin: false, canManageProjects: false };
        }
        throw error;
      }

      return {
        isAdmin: data?.is_admin ?? false,
        canManageProjects: data?.can_manage_projects ?? false,
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    isAdmin: data?.isAdmin ?? false,
    canManageProjects: data?.canManageProjects ?? false,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load permissions') : null,
  };
};

/**
 * @deprecated Alias for useGlobalPermissions — use useGlobalPermissions directly.
 * Kept temporarily so existing imports don't break during migration.
 */
export const useAdmin = useGlobalPermissions;
