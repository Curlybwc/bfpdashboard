import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeForChecklistMatch, jaccardSimilarity } from '@/lib/checklistMatch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Merge, Check } from 'lucide-react';

interface ScopeItem {
  id: string;
  description: string;
  status: string;
  qty: number | null;
  unit: string | null;
  unit_cost_override: number | null;
  computed_total: number | null;
  pricing_status: string;
  cost_item_id: string | null;
  notes: string | null;
  created_at: string;
  added_after_conversion: boolean;
}

interface DuplicateGroup {
  key: string;
  label: string;
  items: ScopeItem[];
  keeperId: string;
}

const STATUS_PRIORITY: Record<string, number> = {
  'Replace': 5,
  'Repair': 4,
  'Get Bid': 3,
  'OK': 2,
  'Not Checked': 1,
};

interface DeduplicateSheetProps {
  scopeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

function detectDuplicateGroups(items: ScopeItem[]): DuplicateGroup[] {
  const assigned = new Set<string>();
  const groups: DuplicateGroup[] = [];

  // Pass A: group by cost_item_id
  const byCostItem = new Map<string, ScopeItem[]>();
  for (const item of items) {
    if (item.cost_item_id) {
      const arr = byCostItem.get(item.cost_item_id) || [];
      arr.push(item);
      byCostItem.set(item.cost_item_id, arr);
    }
  }
  for (const [costId, group] of byCostItem) {
    if (group.length < 2) continue;
    group.forEach(i => assigned.add(i.id));
    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
    groups.push({ key: `cost:${costId}`, label: sorted[0].description, items: sorted, keeperId: sorted[0].id });
  }

  // Pass B: group by normalized description
  const byNorm = new Map<string, ScopeItem[]>();
  for (const item of items) {
    if (assigned.has(item.id)) continue;
    const norm = normalizeForChecklistMatch(item.description);
    if (!norm) continue;
    const arr = byNorm.get(norm) || [];
    arr.push(item);
    byNorm.set(norm, arr);
  }
  for (const [norm, group] of byNorm) {
    if (group.length < 2) continue;
    group.forEach(i => assigned.add(i.id));
    const sorted = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
    groups.push({ key: `norm:${norm}`, label: sorted[0].description, items: sorted, keeperId: sorted[0].id });
  }

  // Pass C: fuzzy match remaining unassigned items against each other
  const remaining = items.filter(i => !assigned.has(i.id));
  const fuzzyAssigned = new Set<string>();
  for (let i = 0; i < remaining.length; i++) {
    if (fuzzyAssigned.has(remaining[i].id)) continue;
    const normI = normalizeForChecklistMatch(remaining[i].description);
    const cluster = [remaining[i]];
    for (let j = i + 1; j < remaining.length; j++) {
      if (fuzzyAssigned.has(remaining[j].id)) continue;
      const normJ = normalizeForChecklistMatch(remaining[j].description);
      const tokensI = normI.split(' ').filter(Boolean).length;
      const tokensJ = normJ.split(' ').filter(Boolean).length;
      const minTokens = Math.min(tokensI, tokensJ);
      const threshold = minTokens <= 2 ? 0.50 : 0.70;
      if (jaccardSimilarity(normI, normJ) >= threshold || normI.includes(normJ) || normJ.includes(normI)) {
        cluster.push(remaining[j]);
      }
    }
    if (cluster.length >= 2) {
      cluster.forEach(c => fuzzyAssigned.add(c.id));
      const sorted = [...cluster].sort((a, b) => a.created_at.localeCompare(b.created_at));
      groups.push({ key: `fuzzy:${normI}`, label: sorted[0].description, items: sorted, keeperId: sorted[0].id });
    }
  }

  return groups;
}

function mergeGroup(group: DuplicateGroup): { keeper: Partial<ScopeItem>; deleteIds: string[] } {
  const keeper = group.items.find(i => i.id === group.keeperId)!;
  const others = group.items.filter(i => i.id !== group.keeperId);
  const all = group.items;

  // Status: strongest
  const bestStatus = all.reduce((best, i) =>
    (STATUS_PRIORITY[i.status] || 0) > (STATUS_PRIORITY[best] || 0) ? i.status : best,
    keeper.status
  );

  // Qty/unit
  let mergedQty = keeper.qty;
  let mergedUnit = keeper.unit;
  const noteParts: string[] = [];

  const allSameUnit = all.every(i => i.unit === keeper.unit);
  if (allSameUnit && all.every(i => i.qty != null)) {
    mergedQty = all.reduce((sum, i) => sum + (i.qty || 0), 0);
  } else {
    for (const o of others) {
      if (o.qty != null && (o.unit !== keeper.unit || !allSameUnit)) {
        noteParts.push(`Merged "${o.description}": qty=${o.qty} ${o.unit || ''}`);
      }
    }
  }

  // unit_cost_override
  let mergedUnitCost = keeper.unit_cost_override;
  if (mergedUnitCost == null) {
    const firstNonNull = others.find(o => o.unit_cost_override != null);
    if (firstNonNull) mergedUnitCost = firstNonNull.unit_cost_override;
  }
  const distinctCosts = new Set(all.filter(i => i.unit_cost_override != null).map(i => i.unit_cost_override));
  if (distinctCosts.size > 1) {
    noteParts.push(`Cost conflicts: ${[...distinctCosts].join(', ')}`);
  }

  // cost_item_id
  let mergedCostItemId = keeper.cost_item_id;
  if (!mergedCostItemId) {
    const firstWithCost = others.find(o => o.cost_item_id != null);
    if (firstWithCost) mergedCostItemId = firstWithCost.cost_item_id;
  }

  // notes
  const existingNotes = all.map(i => i.notes).filter(Boolean);
  const allNotes = [...existingNotes, ...noteParts].filter(Boolean);
  const mergedNotes = allNotes.length > 0 ? allNotes.join(' | ') : null;

  // computed_total
  const computedTotal = mergedQty != null && mergedUnitCost != null ? mergedQty * mergedUnitCost : null;

  // added_after_conversion
  const addedAfter = all.some(i => i.added_after_conversion);

  return {
    keeper: {
      status: bestStatus,
      qty: mergedQty,
      unit: mergedUnit,
      unit_cost_override: mergedUnitCost,
      computed_total: computedTotal,
      pricing_status: mergedUnitCost != null ? 'Priced' : 'Needs Pricing',
      cost_item_id: mergedCostItemId,
      notes: mergedNotes,
      added_after_conversion: addedAfter,
    },
    deleteIds: others.map(o => o.id),
  };
}

const DeduplicateSheet = ({ scopeId, open, onOpenChange, onUpdate }: DeduplicateSheetProps) => {
  const { toast } = useToast();
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);

  const fetchItems = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    const { data } = await supabase.from('scope_items')
      .select('id, description, status, qty, unit, unit_cost_override, computed_total, pricing_status, cost_item_id, notes, created_at, added_after_conversion')
      .eq('scope_id', scopeId)
      .order('created_at');
    const fetched = (data || []) as ScopeItem[];
    setItems(fetched);
    setGroups(detectDuplicateGroups(fetched));
    setLoading(false);
  }, [open, scopeId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const setKeeper = (groupKey: string, keeperId: string) => {
    setGroups(prev => prev.map(g => g.key === groupKey ? { ...g, keeperId } : g));
  };

  const handleMerge = async () => {
    if (groups.length === 0) return;
    setMerging(true);
    let mergedCount = 0;
    let deletedCount = 0;

    try {
      for (const group of groups) {
        const { keeper, deleteIds } = mergeGroup(group);
        const { error: updateErr } = await supabase.from('scope_items')
          .update(keeper as any)
          .eq('id', group.keeperId);
        if (updateErr) throw updateErr;

        if (deleteIds.length > 0) {
          const { error: delErr } = await supabase.from('scope_items')
            .delete()
            .in('id', deleteIds);
          if (delErr) throw delErr;
          deletedCount += deleteIds.length;
        }
        mergedCount++;
      }

      toast({ title: `Merged ${mergedCount} group(s), removed ${deletedCount} duplicate(s)` });
      onUpdate();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Error merging', description: err.message, variant: 'destructive' });
    } finally {
      setMerging(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Deduplicate Scope Items</span>
            <Badge variant="secondary" className="text-xs">
              {groups.length} group(s) found
            </Badge>
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Scanning for duplicates…</p>
        ) : groups.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No duplicates detected ✓</p>
        ) : (
          <div className="space-y-6 mt-4">
            {groups.map(group => (
              <div key={group.key} className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Merge className="h-4 w-4 text-muted-foreground" />
                  {group.label}
                  <Badge variant="outline" className="text-xs">{group.items.length} items</Badge>
                </h3>
                <div className="space-y-1">
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setKeeper(group.key, item.id)}
                      className={`w-full text-left text-xs p-2 rounded border transition-colors ${
                        item.id === group.keeperId
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {item.id === group.keeperId && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
                        <span className="font-medium flex-1">{item.description}</span>
                        <Badge variant="secondary" className="text-[10px]">{item.status}</Badge>
                      </div>
                      <div className="text-muted-foreground mt-0.5 ml-5">
                        qty={item.qty ?? '–'} {item.unit || ''} · ${item.unit_cost_override ?? '–'}/u · total=${item.computed_total ?? '–'} · {item.pricing_status}
                        {item.cost_item_id && ' · linked'}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Click a row to set it as keeper. Others will be merged into it and deleted.
                </p>
              </div>
            ))}

            <Button onClick={handleMerge} disabled={merging} className="w-full">
              {merging ? 'Merging…' : `Merge ${groups.length} group(s)`}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default DeduplicateSheet;
