import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Search, ExternalLink, RefreshCw } from 'lucide-react';
import SyncToLibraryDialog from '@/components/SyncToLibraryDialog';

interface MaterialItem {
  id: string;
  name: string;
  normalized_name: string;
  sku: string | null;
  vendor_url: string | null;
  unit_cost: number | null;
  unit: string | null;
  store_section: string | null;
  is_active: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export default function AdminMaterialLibrary() {
  const { toast } = useToast();
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<MaterialItem | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushPromptItemId, setPushPromptItemId] = useState<string | null>(null);
  const [pushPromptLoading, setPushPromptLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [vendorUrl, setVendorUrl] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unit, setUnit] = useState('');
  const [storeSection, setStoreSection] = useState('');

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('material_library')
      .select('*')
      .order('name');
    if (error) {
      toast({ title: 'Error loading materials', description: error.message, variant: 'destructive' });
    } else {
      setItems((data as MaterialItem[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (!showInactive) result = result.filter(i => i.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        (i.store_section && i.store_section.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, search, showInactive]);

  const openNew = () => {
    setEditItem(null);
    setName(''); setSku(''); setVendorUrl(''); setUnitCost(''); setUnit(''); setStoreSection('');
    setDialogOpen(true);
  };

  const openEdit = (item: MaterialItem) => {
    setEditItem(item);
    setName(item.name);
    setSku(item.sku || '');
    setVendorUrl(item.vendor_url || '');
    setUnitCost(item.unit_cost != null ? String(item.unit_cost) : '');
    setUnit(item.unit || '');
    setStoreSection(item.store_section || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    const payload = {
      name: name.trim(),
      normalized_name: normalize(name),
      sku: sku.trim() || null,
      vendor_url: vendorUrl.trim() || null,
      unit_cost: unitCost ? parseFloat(unitCost) : null,
      unit: unit.trim() || null,
      store_section: storeSection.trim() || null,
    };

    if (editItem) {
      const { error } = await supabase.from('material_library').update(payload).eq('id', editItem.id);
      if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Material updated' });
      setDialogOpen(false);
      fetchItems();
      // Prompt to push changes to all recipes & tasks
      setPushPromptItemId(editItem.id);
      setPushPromptOpen(true);
    } else {
      const { error, data: inserted } = await supabase.from('material_library').insert(payload).select('id').single();
      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Duplicate material name', variant: 'destructive' });
        } else {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
        }
        return;
      }
      toast({ title: 'Material added' });
      setDialogOpen(false);
      fetchItems();
    }
  };

  const handlePushPromptConfirm = async () => {
    if (!pushPromptItemId) return;
    setPushPromptLoading(true);
    const { data, error } = await supabase.rpc('push_material_library_to_all' as any, { p_material_id: pushPromptItemId });
    setPushPromptLoading(false);
    if (error) {
      toast({ title: 'Error pushing updates', description: error.message, variant: 'destructive' });
    } else {
      const result = data as any;
      toast({
        title: 'Material synced everywhere',
        description: `${result?.recipe_materials_updated ?? 0} recipe items, ${result?.task_materials_updated ?? 0} task items updated`,
      });
    }
    setPushPromptOpen(false);
    setPushPromptItemId(null);
  };

  const toggleActive = async (item: MaterialItem) => {
    const { error } = await supabase.from('material_library').update({ is_active: !item.is_active }).eq('id', item.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    fetchItems();
  };

  const handlePushToAll = async (item: MaterialItem) => {
    setPushingId(item.id);
    const { data, error } = await supabase.rpc('push_material_library_to_all' as any, { p_material_id: item.id });
    setPushingId(null);
    if (error) {
      toast({ title: 'Error pushing updates', description: error.message, variant: 'destructive' });
      return;
    }
    const result = data as any;
    toast({
      title: 'Material synced everywhere',
      description: `${result?.recipe_materials_updated ?? 0} recipe items, ${result?.task_materials_updated ?? 0} task items updated`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Materials Library ({filtered.length})
        </h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add Material</Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search materials…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Inactive</span>
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No materials found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} className={`p-3 ${!item.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {item.unit_cost != null && <span>${item.unit_cost.toFixed(2)}{item.unit ? `/${item.unit}` : ''}</span>}
                    {item.sku && <span>SKU: {item.sku}</span>}
                    {item.store_section && <span>§ {item.store_section}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.vendor_url && (
                    <a href={item.vendor_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePushToAll(item)} disabled={pushingId === item.id} title="Push to all recipes & tasks">
                    <RefreshCw className={`h-3.5 w-3.5 ${pushingId === item.id ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Material' : 'Add Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Unit Cost ($)</Label><Input type="number" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} /></div>
              <div><Label>Unit</Label><Input placeholder="e.g. each, sqft, lf" value={unit} onChange={e => setUnit(e.target.value)} /></div>
            </div>
            <div><Label>SKU</Label><Input value={sku} onChange={e => setSku(e.target.value)} /></div>
            <div><Label>Vendor URL</Label><Input value={vendorUrl} onChange={e => setVendorUrl(e.target.value)} /></div>
            <div><Label>Store Section</Label><Input value={storeSection} onChange={e => setStoreSection(e.target.value)} /></div>
            <Button className="w-full" onClick={handleSave}>{editItem ? 'Save Changes' : 'Add Material'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
