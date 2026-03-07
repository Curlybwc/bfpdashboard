import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useScopeDetail(scopeId: string | undefined) {
  return useQuery({
    queryKey: ['scope-detail', scopeId],
    queryFn: async () => {
      const [{ data: scope, error: sErr }, { data: items, error: iErr }] = await Promise.all([
        supabase.from('scopes').select('*').eq('id', scopeId!).maybeSingle(),
        supabase.from('scope_items').select('*').eq('scope_id', scopeId!).order('created_at'),
      ]);
      if (sErr) throw sErr;
      if (iErr) throw iErr;
      if (!scope) throw new Error('Scope not found');
      return {
        scope,
        items: items ?? [],
      };
    },
    enabled: !!scopeId,
  });
}
