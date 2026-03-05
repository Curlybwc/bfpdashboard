
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeForChecklistMatch, isChecklistCovered, matchExistingScopeItem } from '@/lib/checklistMatch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Wrench, RefreshCw, HelpCircle } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  normalized_label: string;
  category: string | null;
  default_cost_item_id: string | null;
  sort_order: number;
}

interface ScopeItem {
  id: string;
  description: string;
  status: string;
  cost_item_id: string | null;
  unit_cost_override: number | null;
  computed_total: number | null;
}

interface FinalPassSheetProps {
  scopeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

type ActionState = 'OK' | 'Repair' | 'Replace' | 'Get Bid';

const UNIT_MAP: Record<string, string> = {
  each: 'each',
  sqft: 'sqft',
  lf: 'lf',
  piece: 'piece',
};

const FinalPassSheet = ({ scopeId, open, onOpenChange, onUpdate }: FinalPassSheetProps) => {
  const { toast } = useToast();
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [reviews, setReviews] = useState<{ checklist_item_id: string; state: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!open) return;
    setLoading(true);

    // Get the default template
    const { data: templates } = await supabase
      .from('checklist_templates')
      .select('id')
      .eq('active', true)
      .limit(1);

    const templateId = templates?.[0]?.id;
    if (!templateId) { setLoading(false); return; }

    const [{ data: ci }, { data: rev }, { data: si }] = await Promise.all([
      supabase.from('checklist_items').select('id, label, normalized_label, category, default_cost_item_id, sort_order')
        .eq('template_id', templateId).eq('active', true).order('sort_order'),
      supabase.from('scope_checklist_reviews').select('checklist_item_id, state')
        .eq('scope_id', scopeId),
      supabase.from('scope_items').select('id, description, status, cost_item_id, unit_cost_override, computed_total')
        .eq('scope_id', scopeId),
    ]);

    setChecklistItems(ci || []);
    setReviews(rev || []);
    setScopeItems(si || []);
    setLoading(false);
  }, [open, scopeId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const isCovered = (ci: ChecklistItem) => {
    const matchByScopeItem = scopeItems.some(si =>
      isChecklistCovered(si.description, ci.normalized_label, si.cost_item_id, ci.default_cost_item_id)
    );
    const matchByReview = reviews.some(r => r.checklist_item_id === ci.id);
    return matchByScopeItem || matchByReview;
  };

  const uncoveredItems = checklistItems.filter(ci => !isCovered(ci));

  // Group by category
  const grouped = uncoveredItems.reduce<Record<string, ChecklistItem[]>>((acc, ci) => {
    const cat = ci.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ci);
    return acc;
  }, {});

  const handleAction = async (ci: ChecklistItem, action: ActionState) => {
    setActing(ci.id);
    try {
      if (action === 'OK') {
        const { error } = await supabase.from('scope_checklist_reviews').upsert({
          scope_id: scopeId,
          checklist_item_id: ci.id,
          state: 'OK',
        }, { onConflict: 'scope_id,checklist_item_id' });
        if (error) throw error;
      } else {
        // Use the same matching logic as isCovered
        const existing = scopeItems.find(si =>
          isChecklistCovered(si.description, ci.normalized_label, si.cost_item_id, ci.default_cost_item_id)
        );

        if (existing) {
          const { error } = await supabase.from('scope_items').update({ status: action }).eq('id', existing.id);
          if (error) throw error;
        } else {
          // Resolve pricing: try default_cost_item_id first, then fallback search
          let unitCost: number | null = null;
          let unitText: string | null = null;
          let resolvedCostItemId: string | null = ci.default_cost_item_id;

          if (resolvedCostItemId) {
            const { data: costItem } = await supabase.from('cost_items')
              .select('default_total_cost, unit_type')
              .eq('id', resolvedCostItemId).single();
            if (costItem) {
              unitCost = costItem.default_total_cost;
              unitText = UNIT_MAP[costItem.unit_type] || costItem.unit_type;
            }
          }

          // Fallback: search cost_items by normalized_name
          if (!resolvedCostItemId || unitCost == null) {
            const { data: costMatch } = await supabase.from('cost_items')
              .select('id, default_total_cost, unit_type')
              .ilike('normalized_name', `%${ci.normalized_label}%`)
              .eq('active', true)
              .limit(1);
            if (costMatch?.[0]) {
              resolvedCostItemId = costMatch[0].id;
              unitCost = costMatch[0].default_total_cost;
              unitText = UNIT_MAP[costMatch[0].unit_type] || costMatch[0].unit_type;
            }
          }

          const computedTotal = unitCost != null && unitCost > 0 ? 1 * unitCost : null;

          const { error } = await supabase.from('scope_items').insert({
            scope_id: scopeId,
            description: ci.label,
            status: action,
            cost_item_id: resolvedCostItemId,
            unit_cost_override: unitCost != null && unitCost > 0 ? unitCost : null,
            unit: unitText,
            qty: 1,
            computed_total: computedTotal,
            pricing_status: unitCost != null && unitCost > 0 ? 'Priced' : 'Needs Pricing',
          });
          if (error) throw error;
        }

        // Upsert review
        const { error: revErr } = await supabase.from('scope_checklist_reviews').upsert({
          scope_id: scopeId,
          checklist_item_id: ci.id,
          state: action,
        }, { onConflict: 'scope_id,checklist_item_id' });
        if (revErr) throw revErr;
      }

      toast({ title: `${ci.label} → ${action}` });
      onUpdate();
      await fetchAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActing(null);
    }
  };

  const coveredCount = checklistItems.filter(ci => isCovered(ci)).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Final Pass</span>
            <Badge variant="secondary" className="text-xs">
              {coveredCount} / {checklistItems.length} checked
            </Badge>
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Loading checklist…</p>
        ) : uncoveredItems.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">All checklist items covered! ✓</p>
        ) : (
          <div className="space-y-4 mt-4">
            {Object.entries(grouped).map(([category, categoryItems]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</h3>
                <div className="space-y-2">
                  {categoryItems.map(ci => (
                    <div key={ci.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                      <span className="text-sm font-medium flex-1 min-w-0">{ci.label}</span>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs text-success"
                          disabled={acting === ci.id}
                          onClick={() => handleAction(ci, 'OK')}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-0.5" />OK
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs text-orange-600"
                          disabled={acting === ci.id}
                          onClick={() => handleAction(ci, 'Repair')}
                        >
                          <Wrench className="h-3.5 w-3.5 mr-0.5" />Repair
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs text-destructive"
                          disabled={acting === ci.id}
                          onClick={() => handleAction(ci, 'Replace')}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-0.5" />Replace
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-xs text-amber-600"
                          disabled={acting === ci.id}
                          onClick={() => handleAction(ci, 'Get Bid')}
                        >
                          <HelpCircle className="h-3.5 w-3.5 mr-0.5" />Bid
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default FinalPassSheet;
export { type ChecklistItem };
