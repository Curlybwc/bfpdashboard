
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Wrench, RefreshCw, HelpCircle } from 'lucide-react';
import { isChecklistCovered } from '@/lib/checklistMatch';

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
  items: ScopeItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

type ActionState = 'OK' | 'Repair' | 'Replace' | 'Get Bid';

const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

const UNIT_MAP: Record<string, string> = {
  each: 'each',
  sqft: 'sqft',
  lf: 'lf',
  piece: 'piece',
};

const FinalPassSheet = ({ scopeId, items, open, onOpenChange, onUpdate }: FinalPassSheetProps) => {
  const { toast } = useToast();
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [reviews, setReviews] = useState<{ checklist_item_id: string; state: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const fetchChecklist = useCallback(async () => {
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

    const [{ data: ci }, { data: rev }] = await Promise.all([
      supabase.from('checklist_items').select('id, label, normalized_label, category, default_cost_item_id, sort_order')
        .eq('template_id', templateId).eq('active', true).order('sort_order'),
      supabase.from('scope_checklist_reviews').select('checklist_item_id, state')
        .eq('scope_id', scopeId),
    ]);

    setChecklistItems(ci || []);
    setReviews(rev || []);
    setLoading(false);
  }, [open, scopeId]);

  useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

  const isCovered = (ci: ChecklistItem) => {
    // Check scope_items match by normalized description or cost_item_id
    const normalizedItems = items.map(si => ({
      ...si,
      normalized_description: normalize(si.description),
    }));

    const matchByScopeItem = normalizedItems.some(si =>
      si.normalized_description === ci.normalized_label ||
      (si.cost_item_id != null && ci.default_cost_item_id != null && si.cost_item_id === ci.default_cost_item_id)
    );

    // Check if review row exists (any state, since row absence = Not Checked)
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
        // Only create review, no scope_item
        const { error } = await supabase.from('scope_checklist_reviews').upsert({
          scope_id: scopeId,
          checklist_item_id: ci.id,
          state: 'OK',
        }, { onConflict: 'scope_id,checklist_item_id' });
        if (error) throw error;
      } else {
        // Repair/Replace/Get Bid: find or create scope_item, then upsert review
        const normalizedLabel = ci.normalized_label;

        // Check for existing scope_item by normalized description OR cost_item_id
        const existingByDesc = items.find(si => normalize(si.description) === normalizedLabel);
        const existingByCost = ci.default_cost_item_id
          ? items.find(si => si.cost_item_id === ci.default_cost_item_id)
          : null;
        const existing = existingByDesc || existingByCost;

        if (existing) {
          // Update existing scope_item status
          const { error } = await supabase.from('scope_items').update({ status: action }).eq('id', existing.id);
          if (error) throw error;
        } else {
          // Build new scope_item
          let unitCost: number | null = null;
          let unitText: string | null = null;

          if (ci.default_cost_item_id) {
            const { data: costItem } = await supabase.from('cost_items')
              .select('default_total_cost, unit_type')
              .eq('id', ci.default_cost_item_id).single();
            if (costItem) {
              unitCost = costItem.default_total_cost;
              unitText = UNIT_MAP[costItem.unit_type] || costItem.unit_type;
            }
          }

          const computedTotal = unitCost != null ? 1 * unitCost : null;

          const { error } = await supabase.from('scope_items').insert({
            scope_id: scopeId,
            description: ci.label,
            status: action,
            cost_item_id: ci.default_cost_item_id,
            unit_cost_override: unitCost,
            unit: unitText,
            qty: 1,
            computed_total: computedTotal,
            pricing_status: unitCost != null ? 'Priced' : 'Needs Pricing',
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
      // Refresh local state
      await fetchChecklist();
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
