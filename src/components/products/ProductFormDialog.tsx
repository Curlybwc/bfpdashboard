import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle } from 'lucide-react';
import { Product, normalizeName, normalizeUrl } from '@/hooks/useProductLibrary';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: Product | null;
  allProducts: Product[];
  initialName?: string;
  onSaved: (product: Product) => void;
}

export default function ProductFormDialog({ open, onOpenChange, product, allProducts, initialName, onSaved }: Props) {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorUrl, setVendorUrl] = useState('');
  const [sku, setSku] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unit, setUnit] = useState('');
  const [storeSection, setStoreSection] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? initialName ?? '');
    setBrand(product?.brand ?? '');
    setModel(product?.model ?? '');
    setCategory(product?.category ?? '');
    setSubcategory(product?.subcategory ?? '');
    setVendorName(product?.vendor_name ?? '');
    setVendorUrl(product?.vendor_url ?? '');
    setSku(product?.sku ?? '');
    setUnitCost(product?.unit_cost != null ? String(product.unit_cost) : '');
    setUnit(product?.unit ?? '');
    setStoreSection(product?.store_section ?? '');
    setDescription(product?.description ?? '');
    setNotes(product?.notes ?? '');
  }, [open, product, initialName]);

  const duplicates = useMemo(() => {
    const n = normalizeName(name);
    const s = sku.trim().toLowerCase();
    if (!n && !s) return [];
    return allProducts.filter(p =>
      p.id !== product?.id &&
      ((n && p.normalized_name === n) || (s && (p.sku || '').trim().toLowerCase() === s))
    );
  }, [name, sku, allProducts, product?.id]);

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      normalized_name: normalizeName(name),
      brand: brand.trim() || null,
      model: model.trim() || null,
      category: category.trim() || null,
      subcategory: subcategory.trim() || null,
      vendor_name: vendorName.trim() || null,
      vendor_url: normalizeUrl(vendorUrl),
      sku: sku.trim() || null,
      unit_cost: unitCost ? parseFloat(unitCost) : null,
      unit: unit.trim() || null,
      store_section: storeSection.trim() || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
    };

    let saved: Product | null = null;
    if (product) {
      const { data, error } = await supabase.from('material_library').update(payload as any).eq('id', product.id).select('*').single();
      if (error) { setSaving(false); toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
      saved = data as unknown as Product;
    } else {
      const { data, error } = await supabase.from('material_library').insert({ ...payload, org_id: orgId } as any).select('*').single();
      if (error) {
        setSaving(false);
        toast({ title: error.code === '23505' ? 'A product with that name already exists' : 'Could not save', description: error.code === '23505' ? undefined : error.message, variant: 'destructive' });
        return;
      }
      saved = data as unknown as Product;
    }

    // Record a price point whenever a cost is present
    if (saved && payload.unit_cost != null) {
      await supabase.rpc('record_product_price' as any, {
        p_product_id: saved.id,
        p_unit_cost: payload.unit_cost as number,
        p_vendor_name: payload.vendor_name as string | null,
        p_vendor_url: payload.vendor_url as string | null,
        p_sku: payload.sku as string | null,
        p_unit: payload.unit as string | null,
        p_source_project_id: null,
        p_source_task_id: null,
        p_notes: product ? 'Updated in Product Library' : 'Initial price',
      });
    }

    setSaving(false);
    toast({ title: product ? 'Product updated' : 'Product added' });
    onSaved(saved!);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'New Product'}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Product name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 1/2 in. Drywall Sheet 4x8" />
            </div>

            {duplicates.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs space-y-1">
                <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Possible duplicate
                </p>
                {duplicates.slice(0, 3).map(d => (
                  <p key={d.id} className="text-muted-foreground">
                    {d.name}{d.sku ? ` · ${d.sku}` : ''}{d.unit_cost != null ? ` · $${d.unit_cost.toFixed(2)}` : ''}
                  </p>
                ))}
                <p className="text-muted-foreground">You can still save if this is genuinely different.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Brand</Label><Input value={brand} onChange={e => setBrand(e.target.value)} /></div>
              <div><Label className="text-xs">Model / part no.</Label><Input value={model} onChange={e => setModel(e.target.value)} /></div>
              <div><Label className="text-xs">Category</Label><Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Plumbing" /></div>
              <div><Label className="text-xs">Subcategory</Label><Input value={subcategory} onChange={e => setSubcategory(e.target.value)} /></div>
              <div><Label className="text-xs">Price</Label><Input type="number" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
              <div><Label className="text-xs">Unit</Label><Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="each, sqft, lf" /></div>
              <div><Label className="text-xs">Vendor</Label><Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="e.g. Home Depot" /></div>
              <div><Label className="text-xs">SKU</Label><Input value={sku} onChange={e => setSku(e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Vendor link</Label><Input value={vendorUrl} onChange={e => setVendorUrl(e.target.value)} placeholder="homedepot.com/p/…" /></div>
            <div><Label className="text-xs">Store section</Label><Input value={storeSection} onChange={e => setStoreSection(e.target.value)} /></div>
            <div><Label className="text-xs">Description</Label><Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </div>
        </ScrollArea>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
