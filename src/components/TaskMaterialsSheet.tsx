import { useState, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Pencil, ExternalLink, Copy, Link } from 'lucide-react';

interface TaskMaterial {
  id: string;
  task_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  purchased: boolean;
  delivered: boolean;
  sku: string | null;
  vendor_url: string | null;
  item_type: string;
  provided_by: string;
  confirmed_on_site: boolean;
  created_at: string;
  tool_type_id: string | null;
}

interface TaskMaterialsSheetProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMaterialsChange: () => void;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

const TaskMaterialsSheet = ({ taskId, open, onOpenChange, onMaterialsChange }: TaskMaterialsSheetProps) => {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<TaskMaterial[]>([]);
  const [loading, setLoading] = useState(false);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newVendorUrl, setNewVendorUrl] = useState('');
  const [newItemType, setNewItemType] = useState<string>('material');
  const [newProvidedBy, setNewProvidedBy] = useState<string>('either');

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editMaterial, setEditMaterial] = useState<TaskMaterial | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editVendorUrl, setEditVendorUrl] = useState('');
  const [editItemType, setEditItemType] = useState<string>('material');
  const [editProvidedBy, setEditProvidedBy] = useState<string>('either');
  const [editLoading, setEditLoading] = useState(false);

  const fetchMaterials = async () => {
    const { data, error } = await supabase
      .from('task_materials')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setMaterials((data as unknown as TaskMaterial[]) || []);
  };

  useEffect(() => {
    if (open) fetchMaterials();
  }, [open, taskId]);

  const runDerivation = async () => {
    const { data } = await supabase
      .from('task_materials')
      .select('delivered, item_type, confirmed_on_site')
      .eq('task_id', taskId);

    const items = (data as unknown as Pick<TaskMaterial, 'delivered' | 'item_type' | 'confirmed_on_site'>[]) || [];
    
    // If zero items, don't change materials_on_site (preserve existing behavior)
    if (items.length === 0) {
      onMaterialsChange();
      return;
    }

    const materialItems = items.filter(i => i.item_type === 'material');
    const toolItems = items.filter(i => i.item_type === 'tool');

    const allMaterialsDelivered = materialItems.length === 0 || materialItems.every(m => m.delivered === true);
    const allToolsConfirmed = toolItems.length === 0 || toolItems.every(t => t.confirmed_on_site === true);

    const newStatus: 'Yes' | 'No' = (allMaterialsDelivered && allToolsConfirmed) ? 'Yes' : 'No';

    await supabase.from('tasks').update({ materials_on_site: newStatus }).eq('id', taskId);
    onMaterialsChange();
  };

  const handlePurchasedToggle = async (material: TaskMaterial, checked: boolean) => {
    if (checked) {
      await supabase.from('task_materials').update({ purchased: true }).eq('id', material.id);
    } else {
      await supabase.from('task_materials').update({ purchased: false, delivered: false }).eq('id', material.id);
    }
    await runDerivation();
    await fetchMaterials();
  };

  const handleDeliveredToggle = async (material: TaskMaterial, checked: boolean) => {
    if (checked) {
      await supabase.from('task_materials').update({ delivered: true, purchased: true }).eq('id', material.id);
    } else {
      await supabase.from('task_materials').update({ delivered: false }).eq('id', material.id);
    }
    await runDerivation();
    await fetchMaterials();
  };

  const handleConfirmedOnSiteToggle = async (material: TaskMaterial, checked: boolean) => {
    if (checked && material.provided_by === 'company') {
      // Auto-sync: company tool on site → also mark delivered+purchased
      await supabase.from('task_materials').update({ confirmed_on_site: true, delivered: true, purchased: true }).eq('id', material.id);
    } else if (!checked) {
      // Only unset confirmed_on_site, preserve purchased/delivered history
      await supabase.from('task_materials').update({ confirmed_on_site: false }).eq('id', material.id);
    } else {
      await supabase.from('task_materials').update({ confirmed_on_site: checked }).eq('id', material.id);
    }
    await runDerivation();
    await fetchMaterials();
  };

  const handleProvidedByChange = async (material: TaskMaterial, value: string) => {
    await supabase.from('task_materials').update({ provided_by: value }).eq('id', material.id);
    await fetchMaterials();
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('task_materials').insert({
      task_id: taskId,
      name: newName.trim(),
      quantity: newQty ? parseFloat(newQty) : null,
      unit: newUnit.trim() || null,
      sku: newSku.trim() || null,
      vendor_url: normalizeUrl(newVendorUrl),
      item_type: newItemType,
      provided_by: newItemType === 'tool' ? newProvidedBy : 'either',
    } as any);
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName(''); setNewQty(''); setNewUnit(''); setNewSku(''); setNewVendorUrl('');
    setNewItemType('material'); setNewProvidedBy('either');
    await fetchMaterials();
  };

  const openEdit = (m: TaskMaterial) => {
    setEditMaterial(m);
    setEditName(m.name);
    setEditQty(m.quantity?.toString() ?? '');
    setEditUnit(m.unit ?? '');
    setEditSku(m.sku ?? '');
    setEditVendorUrl(m.vendor_url ?? '');
    setEditItemType(m.item_type ?? 'material');
    setEditProvidedBy(m.provided_by ?? 'either');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editMaterial || !editName.trim()) return;
    setEditLoading(true);
    const { error } = await supabase.from('task_materials').update({
      name: editName.trim(),
      quantity: editQty ? parseFloat(editQty) : null,
      unit: editUnit.trim() || null,
      sku: editSku.trim() || null,
      vendor_url: normalizeUrl(editVendorUrl),
      item_type: editItemType,
      provided_by: editItemType === 'tool' ? editProvidedBy : 'either',
    } as any).eq('id', editMaterial.id);
    setEditLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setEditOpen(false);
    await fetchMaterials();
    await runDerivation();
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied!', description: `${label} copied to clipboard.` });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const openVendorLink = (url: string | null) => {
    if (!url || !url.trim()) {
      toast({ title: 'No vendor link' });
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const materialItems = materials.filter(m => m.item_type !== 'tool');
  const toolItems = materials.filter(m => m.item_type === 'tool');

  const renderItemCard = (m: TaskMaterial) => (
    <div key={m.id} className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{m.name}</p>
          {(m.quantity || m.unit) && (
            <p className="text-xs text-muted-foreground">
              {m.quantity}{m.unit ? ` ${m.unit}` : ''}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(m)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {(m.sku || m.vendor_url) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {m.sku && (
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => copyToClipboard(m.sku!, 'SKU')}>
              <Copy className="h-3 w-3" />SKU: {m.sku}
            </Button>
          )}
          {m.vendor_url && (
            <>
              <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => openVendorLink(m.vendor_url)}>
                <ExternalLink className="h-3 w-3" />Open
              </Button>
              <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => copyToClipboard(m.vendor_url!, 'Link')}>
                <Link className="h-3 w-3" />Copy
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {m.item_type !== 'tool' ? (
          <>
            <div className="flex flex-col items-center gap-0.5">
              <Switch checked={m.purchased} onCheckedChange={(c) => handlePurchasedToggle(m, c)} />
              <span className="text-[10px] text-muted-foreground">Bought</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Switch checked={m.delivered} onCheckedChange={(c) => handleDeliveredToggle(m, c)} />
              <span className="text-[10px] text-muted-foreground">Delivered</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-0.5">
              <Switch
                checked={m.confirmed_on_site}
                onCheckedChange={(c) => handleConfirmedOnSiteToggle(m, c)}
                disabled={m.provided_by === 'company' && !!m.tool_type_id}
              />
              <span className="text-[10px] text-muted-foreground leading-tight text-center max-w-[100px]">
                {m.provided_by === 'company'
                  ? (m.tool_type_id ? 'Stock-based' : 'Company Tool OnSite')
                  : m.provided_by === 'contractor' ? 'Contractor Tool OnSite' : 'Tool OnSite'}
              </span>
            </div>
            {m.provided_by !== 'contractor' && (
              <div className="flex flex-col items-center gap-0.5">
                <Switch checked={m.purchased} onCheckedChange={(c) => handlePurchasedToggle(m, c)} />
                <span className="text-[10px] text-muted-foreground">Bought</span>
              </div>
            )}
          </>
        )}
        {m.item_type === 'tool' && (
          <div className="flex flex-col gap-0.5 ml-auto">
            <Select value={m.provided_by} onValueChange={(v) => handleProvidedByChange(m, v)}>
              <SelectTrigger className="h-6 text-[11px] w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="either">Either</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[10px] text-muted-foreground text-center">Provided by</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>📦 Materials & Tools</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="px-4 flex-1 overflow-auto" style={{ maxHeight: '50vh' }}>
          {materials.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No materials or tools added yet.</p>
          )}

          {materialItems.length > 0 && (
            <div className="space-y-2 mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Materials</h3>
              {materialItems.map(renderItemCard)}
            </div>
          )}

          {toolItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🔧 Tools</h3>
              {toolItems.map(renderItemCard)}
            </div>
          )}
        </ScrollArea>

        {/* Add Item Form */}
        <div className="px-4 pt-3 pb-1 border-t space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Add</Label>
            <Select value={newItemType} onValueChange={setNewItemType}>
              <SelectTrigger className="h-7 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="material">Material</SelectItem>
                <SelectItem value="tool">Tool</SelectItem>
              </SelectContent>
            </Select>
            {newItemType === 'tool' && (
              <Select value={newProvidedBy} onValueChange={setNewProvidedBy}>
                <SelectTrigger className="h-7 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="either">Either</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Name *" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
            <Input placeholder="Qty" type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-16" />
            <Input placeholder="Unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="w-16" />
          </div>
          <div className="flex gap-2">
            <Input placeholder="SKU (optional)" value={newSku} onChange={(e) => setNewSku(e.target.value)} className="flex-1" />
            <Input placeholder="Vendor URL (optional)" value={newVendorUrl} onChange={(e) => setNewVendorUrl(e.target.value)} className="flex-1" />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={loading || !newName.trim()} className="w-full">
            Add {newItemType === 'tool' ? 'Tool' : 'Material'}
          </Button>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editItemType === 'tool' ? 'Tool' : 'Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={editItemType} onValueChange={setEditItemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="tool">Tool</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editItemType === 'tool' && (
              <div>
                <Label className="text-xs">Provided By</Label>
                <Select value={editProvidedBy} onValueChange={setEditProvidedBy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                    <SelectItem value="either">Either</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Unit</Label>
                <Input value={editUnit} onChange={(e) => setEditUnit(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">SKU</Label>
              <Input value={editSku} onChange={(e) => setEditSku(e.target.value)} placeholder="e.g. HD-12345" />
            </div>
            <div>
              <Label className="text-xs">Vendor URL</Label>
              <Input value={editVendorUrl} onChange={(e) => setEditVendorUrl(e.target.value)} placeholder="e.g. homedepot.com/p/12345" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editLoading || !editName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Drawer>
  );
};

export default TaskMaterialsSheet;
