import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const useAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageProjects, setCanManageProjects] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setCanManageProjects(false);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_admin, can_manage_projects')
        .eq('id', user.id)
        .single();
      setIsAdmin(data?.is_admin ?? false);
      setCanManageProjects(data?.can_manage_projects ?? false);
      setLoading(false);
    };

    fetch();
  }, [user]);

  return { isAdmin, canManageProjects, loading };
};
