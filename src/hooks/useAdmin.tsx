import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface AdminFlags {
  isAdmin: boolean;
  canManageProjects: boolean;
}

/**
 * Centralized permission flags backed by React Query.
 * All consumers share a single cached query keyed on user id,
 * eliminating duplicate profile fetches across nav, guards, and pages.
 */
export const useAdmin = () => {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<AdminFlags>({
    queryKey: ['profile-permissions', user?.id],
    queryFn: async (): Promise<AdminFlags> => {
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
    staleTime: 5 * 60 * 1000, // 5 min — admin flags rarely change mid-session
    gcTime: 10 * 60 * 1000,
  });

  return {
    isAdmin: data?.isAdmin ?? false,
    canManageProjects: data?.canManageProjects ?? false,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load permissions') : null,
  };
};
