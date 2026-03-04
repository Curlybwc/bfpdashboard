import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStoreSections, StoreSection } from '@/hooks/useStoreSections';
import { useToast } from '@/hooks/use-toast';
import { inferStoreSection } from '@/lib/inferStoreSection';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ChevronUp, ChevronDown, Plus, RotateCcw, Wand2, Loader2 } from 'lucide-react';

export default function AdminStoreSections() {
  const { toast } = useToast();
  const { sections, loading, refetch } = useStoreSections(true);
  const [showInactive, setShowInactive] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrder, setNewOrder] = useState('');
  const [adding, setAdding] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const active = sections.filter(s => s.is_active);
  const inactive = sections.filter(s => !s.is_active);
  const activeNames = active.map(s => s.name);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const maxOrder = active.length > 0 ? Math.max(...active.map(s => s.sort_order)) : 0;
    const order = newOrder ? parseInt(newOrder) : maxOrder + 10;
    const { error } = await supabase.from('store_sections').insert({
      name: newName.trim(),
      sort_order: order,
    } as any);
    setAdding(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName('');
    setNewOrder('');
    refetch();
  };

  const handleDeactivate = async (s: StoreSection) => {
    await supabase.from('store_sections').update({ is_active: false } as any).eq('id', s.id);
    refetch();
  };

  const handleReactivate = async (s: StoreSection) => {
    await supabase.from('store_sections').update({ is_active: true } as any).eq('id', s.id);
    refetch();
  };

  const handleMove = async (section: StoreSection, direction: 'up' | 'down') => {
    const idx = active.findIndex(s => s.id === section.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= active.length) return;
    const other = active[swapIdx];
    await Promise.all([
      supabase.from('store_sections').update({ sort_order: other.sort_order } as any).eq('id', section.id),
      supabase.from('store_sections').update({ sort_order: section.sort_order } as any).eq('id', other.id),
    ]);
    refetch();
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      // Fetch all non-manual rows
      const { data, error } = await supabase
        .from('task_materials')
        .select('id, name, store_section, item_type')
        .eq('store_section_manual', false);

      if (error) {
        toast({ title: 'Error fetching materials', description: error.message, variant: 'destructive' });
        setBackfilling(false);
        return;
      }

      // Filter to uncategorized: null, empty, or not in active sections
      const candidates = (data || []).filter(row => {
        const s = row.store_section?.trim();
        return !s || !activeNames.includes(s);
      });

      // Compute new sections, skip 'Misc'
      const updates: { id: string; store_section: string }[] = [];
      for (const row of candidates) {
        const inferred = inferStoreSection(row.name, activeNames);
        if (inferred !== 'Misc') {
          updates.push({ id: row.id, store_section: inferred });
        }
      }

      // Batch update in chunks of 25
      const CHUNK = 25;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map(u =>
            supabase.from('task_materials').update({ store_section: u.store_section } as any).eq('id', u.id)
          )
        );
      }

      setBackfillOpen(false);
      toast({ title: `Updated ${updates.length} items.` });
    } catch (err: any) {
      toast({ title: 'Backfill failed', description: err.message, variant: 'destructive' });
    } finally {
      setBackfilling(false);
    }
  };

  if (loading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="pb-20">
      <PageHeader title="Store Sections" backTo="/admin" />
      <div className="p-4 space-y-4">
        {/* Add form */}
        <Card className="p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Add Section</p>
          <div className="flex gap-2">
            <Input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} className="flex-1" />
            <Input placeholder="Order" type="number" value={newOrder} onChange={e => setNewOrder(e.target.value)} className="w-20" />
            <Button size="sm" onClick={handleAdd} disabled={adding || !newName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Backfill button */}
        <Button variant="outline" className="w-full gap-2 text-xs" onClick={() => setBackfillOpen(true)}>
          <Wand2 className="h-4 w-4" />
          Auto-categorize Uncategorized
        </Button>

        {/* Active sections */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Active ({active.length})</h2>
          {active.map((s, i) => (
            <Card key={s.id} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-[10px] text-muted-foreground">Order: {s.sort_order}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => handleMove(s, 'up')}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === active.length - 1} onClick={() => handleMove(s, 'down')}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDeactivate(s)}>
                  Deactivate
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Inactive toggle */}
        {inactive.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} id="show-inactive" />
              <Label htmlFor="show-inactive" className="text-xs text-muted-foreground">Show inactive ({inactive.length})</Label>
            </div>
            {showInactive && inactive.map(s => (
              <Card key={s.id} className="p-3 flex items-center justify-between gap-2 opacity-60">
                <p className="text-sm">{s.name}</p>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleReactivate(s)}>
                  <RotateCcw className="h-3 w-3" />Reactivate
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Backfill confirmation dialog */}
      <AlertDialog open={backfillOpen} onOpenChange={(o) => { if (!backfilling) setBackfillOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto-categorize Uncategorized</AlertDialogTitle>
            <AlertDialogDescription>
              This will assign store sections to uncategorized items using automatic rules. It will not change items you manually categorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={backfilling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBackfill} disabled={backfilling}>
              {backfilling ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Running…</> : 'Run'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
