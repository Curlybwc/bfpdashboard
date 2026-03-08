import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageProjects, setCanManageProjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resetPermissions = () => {
      setIsAdmin(false);
      setCanManageProjects(false);
    };

    if (!user) {
      if (!cancelled) {
        resetPermissions();
        setError(null);
        setLoading(false);
      }
      return;
    }

    const fetchPermissions = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('is_admin, can_manage_projects')
          .eq('id', user.id)
          .single();

        if (cancelled) return;

        if (fetchError) {
          // Missing profile row should not surface as an app error.
          if (fetchError.code === 'PGRST116') {
            resetPermissions();
            return;
          }

          resetPermissions();
          setError(fetchError.message);
          return;
        }

        setIsAdmin(data?.is_admin ?? false);
        setCanManageProjects(data?.can_manage_projects ?? false);
      } catch (err) {
        if (cancelled) return;
        resetPermissions();
        setError(err instanceof Error ? err.message : 'Failed to load permissions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPermissions();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isAdmin, canManageProjects, loading, error };
};
