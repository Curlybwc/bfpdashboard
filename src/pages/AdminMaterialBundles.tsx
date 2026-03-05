import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStoreSections } from '@/hooks/useStoreSections';
import { Plus, Trash2, ChevronRight, Package } from 'lucide-react';

interface Bundle {
  id: string;
  name: string;
  trade: string | null;
  keywords: string[];
  priority: number;
  active: boolean;
}

interface BundleItem {
  id: string;
  bundle_id: string;
  material_name: string;
  qty: number | null;
  unit: string | null;
  sku: string | null;
  vendor_url: string | null;
  store_section: string | null;
  provided_by: string | null;
}

const AdminMaterialBundles = () => {
  const { isAdmin, canManageProjects, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sections: storeSections } = useStoreSections();

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [items, setItems] = useState<BundleItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newTrade, setNewTrade] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newPriority, setNewPriority] = useState('100');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editTrade, setEditTrade] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editPriority, setEditPriority] = useState('100');

  // New item form
  const [newMatName, setNewMatName] = useState('');
  const [newMatQty, setNewMatQty] = useState('');
  const [newMatUnit, setNewMatUnit] = useState('');
  const [newMatSku, setNewMatSku] = useState('');
  const [newMatVendorUrl, setNewMatVendorUrl] = useState('');
  const [newMatStoreSection, setNewMatStoreSection] = useState('');
  const [newMatProvidedBy, setNewMatProvidedBy] = useState('either');

  const canAccess = isAdmin || canManageProjects;

  useEffect(() => {
    if (!adminLoading && !canAccess) {
      navigate('/projects', { replace: true });
    }
  }, [canAccess, adminLoading, navigate]);

  const fetchBundles = async () => {
    const { data } = await supabase
      .from('task_material_bundles' as any)
      .select('*')
      .order('priority', { ascending: true });
    if (data) setBundles((data as any[]).map(b => ({ ...b, keywords: b.keywords || [] })));
  };

  const fetchItems = async (bundleId: string) => {
    const { data } = await supabase
      .from('task_material_bundle_items' as any)
      .select('*')
      .eq('bundle_id', bundleId)
      .order('created_at');
    if (data) setItems(data as any[]);
  };

  useEffect(() => {
    if (canAccess) fetchBundles();
  }, [canAccess]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    const keywords = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const { error } = await supabase.from('task_material_bundles' as any).insert({
      name: newName.trim(),
      trade: newTrade.trim() || null,
      keywords,
      priority: parseInt(newPriority) || 100,
      created_by: user.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName(''); setNewTrade(''); setNewKeywords(''); setNewPriority('100');
    setCreateOpen(false);
    fetchBundles();
    toast({ title: 'Bundle created' });
  };

  const selectBundle = (bundle: Bundle) => {
    setSelectedBundle(bundle);
    setEditName(bundle.name);
    setEditTrade(bundle.trade || '');
    setEditKeywords(bundle.keywords.join(', '));
    setEditPriority(bundle.priority.toString());
    fetchItems(bundle.id);
  };

  const handleSaveBundle = async () => {
    if (!selectedBundle) return;
    const keywords = editKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const { error } = await supabase.from('task_material_bundles' as any).update({
      name: editName.trim(),
      trade: editTrade.trim() || null,
      keywords,
      priority: parseInt(editPriority) || 100,
    }).eq('id', selectedBundle.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Bundle updated' });
    fetchBundles();
    setSelectedBundle({ ...selectedBundle, name: editName.trim(), trade: editTrade.trim() || null, keywords, priority: parseInt(editPriority) || 100 });
  };

  const handleToggleActive = async (bundle: Bundle) => {
    const { error } = await supabase
      .from('task_material_bundles' as any)
      .update({ active: !bundle.active })
      .eq('id', bundle.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchBundles();
  };

  const handleDeleteBundle = async () => {
    if (!selectedBundle) return;
    const { error } = await supabase.from('task_material_bundles' as any).delete().eq('id', selectedBundle.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Bundle deleted' });
    setSelectedBundle(null);
    setItems([]);
    fetchBundles();
  };

  const handleAddItem = async () => {
    if (!selectedBundle || !newMatName.trim()) return;
    const { error } = await supabase.from('task_material_bundle_items' as any).insert({
      bundle_id: selectedBundle.id,
      material_name: newMatName.trim(),
      qty: newMatQty ? parseFloat(newMatQty) : null,
      unit: newMatUnit.trim() || null,
      sku: newMatSku.trim() || null,
      vendor_url: newMatVendorUrl.trim() || null,
      store_section: newMatStoreSection || null,
      provided_by: newMatProvidedBy || 'either',
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewMatName(''); setNewMatQty(''); setNewMatUnit(''); setNewMatSku(''); setNewMatVendorUrl(''); setNewMatStoreSection(''); setNewMatProvidedBy('either');
    fetchItems(selectedBundle.id);
  };

  const handleDeleteItem = async (itemId: string) => {
    const { error } = await supabase.from('task_material_bundle_items' as any).delete().eq('id', itemId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (selectedBundle) fetchItems(selectedBundle.id);
  };

  if (adminLoading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  if (!canAccess) return null;

  // Detail view
  if (selectedBundle) {
    return (
      <div className="pb-20">
        <PageHeader title={selectedBundle.name} backTo="/admin" actions={
          <Button size="sm" variant="ghost" onClick={() => { setSelectedBundle(null); setItems([]); }}>Back to list</Button>
        } />
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Trade</Label>
              <Input value={editTrade} onChange={(e) => setEditTrade(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input type="number" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Keywords (comma-separated)</Label>
            <Input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} placeholder="replace toilet, toilet replacement, ..." />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveBundle} className="flex-1">Save Bundle</Button>
            <Button variant="destructive" size="icon" onClick={handleDeleteBundle}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Bundle Items */}
          <div className="space-y-2">
            <Label>Materials ({items.length})</Label>
            {items.map(item => (
              <Card key={item.id} className="p-2 flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.material_name}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {item.qty != null && <span className="text-xs text-muted-foreground">{item.qty} {item.unit || ''}</span>}
                    {item.store_section && <Badge variant="secondary" className="text-[9px]">{item.store_section}</Badge>}
                    {item.sku && <Badge variant="outline" className="text-[9px]">{item.sku}</Badge>}
                    {item.provided_by && item.provided_by !== 'either' && <Badge variant="outline" className="text-[9px]">{item.provided_by}</Badge>}
                  </div>
                </div>
                <button onClick={() => handleDeleteItem(item.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Card>
            ))}

            {/* Add item form */}
            <Card className="p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Add Material</p>
              <div className="grid grid-cols-3 gap-1">
                <Input placeholder="Material name *" value={newMatName} onChange={e => setNewMatName(e.target.value)} className="h-8 text-xs col-span-3" />
                <Input placeholder="Qty" type="number" value={newMatQty} onChange={e => setNewMatQty(e.target.value)} className="h-8 text-xs" />
                <Input placeholder="Unit" value={newMatUnit} onChange={e => setNewMatUnit(e.target.value)} className="h-8 text-xs" />
                <Input placeholder="SKU" value={newMatSku} onChange={e => setNewMatSku(e.target.value)} className="h-8 text-xs" />
              </div>
              <Input placeholder="Vendor URL" value={newMatVendorUrl} onChange={e => setNewMatVendorUrl(e.target.value)} className="h-8 text-xs" />
              <div className="grid grid-cols-2 gap-1">
                <Select value={newMatStoreSection} onValueChange={setNewMatStoreSection}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Store section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {storeSections.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={newMatProvidedBy} onValueChange={setNewMatProvidedBy}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Provided by" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="either">Either</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleAddItem} disabled={!newMatName.trim()} className="w-full">
                <Plus className="h-3 w-3 mr-1" />Add Material
              </Button>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="pb-20">
      <PageHeader title="Material Bundles" backTo="/admin" actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Bundle</Button>
      } />
      <div className="p-4 space-y-2">
        <p className="text-sm text-muted-foreground mb-3">
          Bundles auto-attach materials to tasks based on keyword matching. ({bundles.length} total)
        </p>
        {bundles.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No bundles yet.</p>
        ) : (
          bundles.map(bundle => (
            <Card key={bundle.id} className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => selectBundle(bundle)}>
                  <p className="font-medium text-sm truncate">{bundle.name}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {bundle.trade && <Badge variant="secondary" className="text-[9px]">{bundle.trade}</Badge>}
                    <Badge variant="outline" className="text-[9px]">P{bundle.priority}</Badge>
                    {bundle.keywords.slice(0, 3).map((k, i) => (
                      <Badge key={i} variant="outline" className="text-[9px]">{k}</Badge>
                    ))}
                    {bundle.keywords.length > 3 && <span className="text-[9px] text-muted-foreground">+{bundle.keywords.length - 3}</span>}
                  </div>
                </div>
                <Switch
                  checked={bundle.active}
                  onCheckedChange={() => handleToggleActive(bundle)}
                />
                <button onClick={() => selectBundle(bundle)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Material Bundle</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="e.g. Toilet Install Kit" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Trade</Label>
                <Input value={newTrade} onChange={(e) => setNewTrade(e.target.value)} placeholder="Plumbing" />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input type="number" value={newPriority} onChange={(e) => setNewPriority(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Keywords (comma-separated)</Label>
              <Input value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="replace toilet, install toilet, ..." />
            </div>
            <Button type="submit" className="w-full">Create Bundle</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMaterialBundles;
