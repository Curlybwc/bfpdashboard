import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useScopeChecklistCoverage(scopeId: string | undefined) {
  return useQuery({
    queryKey: ['scope-checklist', scopeId],
    queryFn: async () => {
      // Find the first active checklist template
      const { data: templates } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('active', true)
        .limit(1);
      const templateId = templates?.[0]?.id;
      if (!templateId) return { checklistItems: [], reviews: [] };

      const [{ data: ci }, { data: rev }] = await Promise.all([
        supabase
          .from('checklist_items')
          .select('id, label, normalized_label, category, default_cost_item_id, sort_order')
          .eq('template_id', templateId)
          .eq('active', true)
          .order('sort_order'),
        supabase
          .from('scope_checklist_reviews')
          .select('checklist_item_id, state')
          .eq('scope_id', scopeId!),
      ]);
      return {
        checklistItems: ci ?? [],
        reviews: rev ?? [],
      };
    },
    enabled: !!scopeId,
  });
}
