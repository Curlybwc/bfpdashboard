import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useScopeDetail(scopeId: string | undefined) {
  return useQuery({
    queryKey: ['scope-detail', scopeId],
    queryFn: async () => {
      const [{ data: scope, error: sErr }, { data: items }] = await Promise.all([
        supabase.from('scopes').select('*').eq('id', scopeId!).single(),
        supabase.from('scope_items').select('*').eq('scope_id', scopeId!).order('created_at'),
      ]);
      if (sErr) throw sErr;
      return {
        scope: scope!,
        items: items ?? [],
      };
    },
    enabled: !!scopeId,
  });
}
