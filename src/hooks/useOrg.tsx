import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface OrgContext {
  orgId: string | null;
  orgName: string | null;
  orgRole: 'owner' | 'admin' | 'member' | null;
  loading: boolean;
}

const OrgContext = createContext<OrgContext>({
  orgId: null,
  orgName: null,
  orgRole: null,
  loading: true,
});

export const OrgProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['user-org', user?.id],
    queryFn: async () => {
      // Get the user's org membership
      const { data: membership, error: memError } = await supabase
        .from('org_members')
        .select('org_id, role, organizations(name)')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();

      if (memError) throw memError;
      if (!membership) return { orgId: null, orgName: null, orgRole: null };

      return {
        orgId: membership.org_id,
        orgName: (membership.organizations as any)?.name ?? null,
        orgRole: membership.role as 'owner' | 'admin' | 'member',
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return (
    <OrgContext.Provider
      value={{
        orgId: data?.orgId ?? null,
        orgName: data?.orgName ?? null,
        orgRole: data?.orgRole ?? null,
        loading: isLoading,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => useContext(OrgContext);
