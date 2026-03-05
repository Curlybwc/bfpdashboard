import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeForChecklistMatch, isChecklistCovered, matchExistingScopeItem } from '@/lib/checklistMatch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  qty: number | null;
  unit: string | null;
  unit_cost_override: number | null;
  computed_total: number | null;
  notes: string | null;
}

interface FinalPassSheetProps {
  scopeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

type ActionState = 'OK' | 'Repair' | 'Replace' | 'Get Bid';

interface DetailForm {
  qty: string;
  unit: string;
  unitCost: string;
  notes: string;
}

const UNIT_OPTIONS = ['each', 'sqft', 'lf', 'piece'];

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

  // Detail dialog state
  const [pendingAction, setPendingAction] = useState<{ ci: ChecklistItem; action: ActionState } | null>(null);
  const [detailForm, setDetailForm] = useState<DetailForm>({ qty: '1', unit: '', unitCost: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!open) return;
    setLoading(true);

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
      supabase.from('scope_items').select('id, description, status, cost_item_id, qty, unit, unit_cost_override, computed_total, notes')
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

  const grouped = uncoveredItems.reduce<Record<string, ChecklistItem[]>>((acc, ci) => {
    const cat = ci.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ci);
    return acc;
  }, {});

  // OK — immediate save (unchanged)
  const handleOK = async (ci: ChecklistItem) => {
    setActing(ci.id);
    try {
      const { error } = await supabase.from('scope_checklist_reviews').upsert({
        scope_id: scopeId,
        checklist_item_id: ci.id,
        state: 'OK',
      }, { onConflict: 'scope_id,checklist_item_id' });
      if (error) throw error;
      toast({ title: `${ci.label} → OK` });
      onUpdate();
      await fetchAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActing(null);
    }
  };

  // Open detail dialog with prefill
  const openDetailDialog = async (ci: ChecklistItem, action: ActionState) => {
    // 1) Try existing scope item match
    const existing = matchExistingScopeItem(scopeItems, ci.label, ci.default_cost_item_id);

    if (existing) {
      setDetailForm({
        qty: existing.qty != null ? String(existing.qty) : '1',
        unit: existing.unit || '',
        unitCost: existing.unit_cost_override != null ? String(existing.unit_cost_override) : '',
        notes: existing.notes || '',
      });
    } else {
      // 2) Try cost library defaults
      let unitCost = '';
      let unit = '';

      if (ci.default_cost_item_id) {
        const { data: costItem } = await supabase.from('cost_items')
          .select('default_total_cost, unit_type').eq('id', ci.default_cost_item_id).single();
        if (costItem) {
          if (costItem.default_total_cost > 0) unitCost = String(costItem.default_total_cost);
          unit = UNIT_MAP[costItem.unit_type] || costItem.unit_type;
        }
      }

      if (!unitCost) {
        const { data: costMatch } = await supabase.from('cost_items')
          .select('default_total_cost, unit_type')
          .ilike('normalized_name', `%${ci.normalized_label}%`)
          .eq('active', true).limit(1);
        if (costMatch?.[0]) {
          if (costMatch[0].default_total_cost > 0) unitCost = String(costMatch[0].default_total_cost);
          if (!unit) unit = UNIT_MAP[costMatch[0].unit_type] || costMatch[0].unit_type;
        }
      }

      setDetailForm({ qty: '1', unit, unitCost, notes: '' });
    }

    setPendingAction({ ci, action });
  };

  // Parse helper: blank/NaN → null
  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  // Confirm save from dialog
  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setSaving(true);
    const { ci, action } = pendingAction;

    const qty = parseNum(detailForm.qty);
    const unitCost = parseNum(detailForm.unitCost);
    const computedTotal = qty != null && unitCost != null ? qty * unitCost : null;
    const pricingStatus = unitCost != null ? 'Priced' : 'Needs Pricing';
    const formNotes = detailForm.notes.trim() || null;

    try {
      const existing = matchExistingScopeItem(scopeItems, ci.label, ci.default_cost_item_id);

      if (existing) {
        const updates: Record<string, any> = {
          status: action,
          qty,
          unit: detailForm.unit || null,
          unit_cost_override: unitCost,
          computed_total: computedTotal,
          pricing_status: pricingStatus,
        };

        // Backfill cost_item_id if missing
        if (!existing.cost_item_id && ci.default_cost_item_id) {
          updates.cost_item_id = ci.default_cost_item_id;
        }

        // Notes: append if existing differs
        if (formNotes) {
          if (existing.notes && existing.notes.trim() && formNotes !== existing.notes.trim()) {
            updates.notes = existing.notes.trim() + '\n' + formNotes;
          } else {
            updates.notes = formNotes;
          }
        }

        const { error } = await supabase.from('scope_items').update(updates).eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert new
        let resolvedCostItemId: string | null = ci.default_cost_item_id;

        if (!resolvedCostItemId) {
          const { data: costMatch } = await supabase.from('cost_items')
            .select('id')
            .ilike('normalized_name', `%${ci.normalized_label}%`)
            .eq('active', true).limit(1);
          if (costMatch?.[0]) resolvedCostItemId = costMatch[0].id;
        }

        const { error } = await supabase.from('scope_items').insert({
          scope_id: scopeId,
          description: ci.label,
          status: action,
          cost_item_id: resolvedCostItemId,
          qty,
          unit: detailForm.unit || null,
          unit_cost_override: unitCost,
          computed_total: computedTotal,
          pricing_status: pricingStatus,
          notes: formNotes,
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

      toast({ title: `${ci.label} → ${action}` });
      onUpdate();
      setPendingAction(null);
      await fetchAll();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const coveredCount = checklistItems.filter(ci => isCovered(ci)).length;

  const displayTotal = (() => {
    const q = parseNum(detailForm.qty);
    const u = parseNum(detailForm.unitCost);
    if (q != null && u != null) return `$${(q * u).toFixed(2)}`;
    return '—';
  })();

  return (
    <>
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
                            onClick={() => handleOK(ci)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-0.5" />OK
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs text-orange-600"
                            disabled={acting === ci.id}
                            onClick={() => openDetailDialog(ci, 'Repair')}
                          >
                            <Wrench className="h-3.5 w-3.5 mr-0.5" />Repair
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs text-destructive"
                            disabled={acting === ci.id}
                            onClick={() => openDetailDialog(ci, 'Replace')}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-0.5" />Replace
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs text-amber-600"
                            disabled={acting === ci.id}
                            onClick={() => openDetailDialog(ci, 'Get Bid')}
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

      {/* Detail Dialog */}
      <Dialog open={!!pendingAction} onOpenChange={(o) => { if (!o) setPendingAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingAction?.ci.label}
              <Badge variant={pendingAction?.action === 'Replace' ? 'destructive' : 'secondary'} className="text-xs">
                {pendingAction?.action}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Qty</label>
                <Input
                  type="number"
                  step="any"
                  value={detailForm.qty}
                  onChange={e => setDetailForm(f => ({ ...f, qty: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
                <Select value={detailForm.unit} onValueChange={v => setDetailForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Cost ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={detailForm.unitCost}
                  onChange={e => setDetailForm(f => ({ ...f, unitCost: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Total</label>
                <div className="h-10 flex items-center px-3 rounded-md border border-input bg-muted text-sm font-medium">
                  {displayTotal}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea
                value={detailForm.notes}
                onChange={e => setDetailForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleConfirmAction} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FinalPassSheet;
export { type ChecklistItem };
