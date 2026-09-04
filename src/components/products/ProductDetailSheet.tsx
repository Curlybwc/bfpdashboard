import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalLink, Pencil, Plus, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Product, useProductPriceHistory, useProductUsage, useRecordPrice } from '@/hooks/useProductLibrary';

interface Props {
  product: Product | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit: (p: Product) => void;
}

interface Opt { id: string; label: string }

export default function ProductDetailSheet({ product, open, onOpenChange, onEdit }: Props) {
  const { toast } = useToast();
  const { data: history = [] } = useProductPriceHistory(open ? product?.id ?? null : null);
  const { data: usage = [] } = useProductUsage(open ? product : null);
  const recordPrice = useRecordPrice();

  const [newPrice, setNewPrice] = useState('');
  const [newVendor, setNewVendor] = useState('');

  const [projects, setProjects] = useState<Opt[]>([]);
  const [tasks, setTasks] = useState<Opt[]>([]);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [qty, setQty] = useState('1');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewPrice(''); setNewVendor(product?.vendor_name ?? '');
    setProjectId(''); setTaskId(''); setQty('1'); setTasks([]);
    supabase.from('projects').select('id, name').eq('status', 'active').order('name')
      .then(({ data }) => setProjects((data || []).map(p => ({ id: p.id, label: p.name }))));
  }, [open, product]);

  useEffect(() => {
    if (!projectId) { setTasks([]); return; }
    supabase.from('tasks').select('id, task').eq('project_id', projectId).neq('stage', 'Done').order('task')
      .then(({ data }) => setTasks((data || []).map(t => ({ id: t.id, label: t.task }))));
  }, [projectId]);

  if (!product) return null;

  const handleRecordPrice = async () => {
    const value = parseFloat(newPrice);
    if (isNaN(value)) { toast({ title: 'Enter a price', variant: 'destructive' }); return; }
    try {
      await recordPrice.mutateAsync({
        productId: product.id, unitCost: value,
        vendorName: newVendor.trim() || null, unit: product.unit,
      });
      setNewPrice('');
      toast({ title: 'Price recorded' });
    } catch (e: any) {
      toast({ title: 'Could not record price', description: e.message, variant: 'destructive' });
    }
  };

  const handleAddToTask = async () => {
    if (!taskId) { toast({ title: 'Pick a task first', variant: 'destructive' }); return; }
    setAdding(true);
    const { error } = await supabase.from('task_materials').insert({
      task_id: taskId,
      product_library_id: product.id,
      name: product.name,
      quantity: qty ? parseFloat(qty) : null,
      unit: product.unit,
      unit_cost: product.unit_cost,
      sku: product.sku,
      vendor_url: product.vendor_url,
      store_section: product.store_section,
      item_type: 'material',
      provided_by: 'either',
    } as any);
    setAdding(false);
    if (error) { toast({ title: 'Could not add', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Added to task` });
    setTaskId('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b text-left">
          <SheetTitle className="pr-8 text-base leading-tight">{product.name}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            <div className="flex flex-wrap gap-1.5">
              {product.category && <Badge variant="secondary">{product.category}</Badge>}
              {product.subcategory && <Badge variant="outline">{product.subcategory}</Badge>}
              {product.brand && <Badge variant="outline">{product.brand}</Badge>}
              {!product.is_active && <Badge variant="destructive">Inactive</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">Current price</span>
              <span className="font-medium">{product.unit_cost != null ? `$${product.unit_cost.toFixed(2)}${product.unit ? `/${product.unit}` : ''}` : '—'}</span>
              <span className="text-muted-foreground">Vendor</span><span>{product.vendor_name || '—'}</span>
              <span className="text-muted-foreground">SKU</span><span>{product.sku || '—'}</span>
              <span className="text-muted-foreground">Model</span><span>{product.model || '—'}</span>
              <span className="text-muted-foreground">Store section</span><span>{product.store_section || '—'}</span>
            </div>

            {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}
            {product.notes && <p className="text-sm text-muted-foreground italic">{product.notes}</p>}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(product)}>
                <Pencil className="h-3.5 w-3.5" />Edit
              </Button>
              {product.vendor_url && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(product.vendor_url!, '_blank', 'noopener')}>
                  <ExternalLink className="h-3.5 w-3.5" />Vendor page
                </Button>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-1.5"><TrendingUp className="h-4 w-4" />Price history</h3>
              <div className="flex gap-2">
                <Input className="w-28" type="number" step="0.01" placeholder="Price" value={newPrice} onChange={e => setNewPrice(e.target.value)} />
                <Input className="flex-1" placeholder="Vendor" value={newVendor} onChange={e => setNewVendor(e.target.value)} />
                <Button size="sm" onClick={handleRecordPrice} disabled={recordPrice.isPending}>Record</Button>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground">No price history yet.</p>
              ) : (
                <div className="space-y-1">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-xs border rounded-md px-2.5 py-1.5">
                      <span className="font-medium">{h.unit_cost != null ? `$${Number(h.unit_cost).toFixed(2)}` : '—'}{h.unit ? `/${h.unit}` : ''}</span>
                      <span className="text-muted-foreground truncate px-2">{h.vendor_name || '—'}</span>
                      <span className="text-muted-foreground">{h.date_recorded}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Add to a task</h3>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Choose project" /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={taskId} onValueChange={setTaskId} disabled={!projectId}>
                <SelectTrigger><SelectValue placeholder={projectId ? 'Choose task' : 'Pick a project first'} /></SelectTrigger>
                <SelectContent>{tasks.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex gap-2">
                <div className="w-28">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" value={qty} onChange={e => setQty(e.target.value)} />
                </div>
                <Button className="flex-1 self-end gap-1.5" onClick={handleAddToTask} disabled={adding || !taskId}>
                  <Plus className="h-4 w-4" />Add to task
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Used on ({usage.length})</h3>
              {usage.length === 0 ? (
                <p className="text-xs text-muted-foreground">Not used on any open task yet.</p>
              ) : (
                usage.map(u => (
                  <div key={u.task_material_id} className="text-xs border rounded-md px-2.5 py-1.5">
                    <p className="font-medium truncate">{u.project_name}</p>
                    <p className="text-muted-foreground truncate">
                      {u.task_title} · {u.quantity ?? '—'}{u.unit ? ` ${u.unit}` : ''} · {u.purchased ? 'bought' : 'not bought'}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
