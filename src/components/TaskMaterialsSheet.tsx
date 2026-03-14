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
import { useStoreSections } from '@/hooks/useStoreSections';
import { Pencil, ExternalLink, Copy, Link, Trash2, RotateCcw, Package } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import RecordLeftoverSheet from '@/components/RecordLeftoverSheet';
import { inferStoreSection } from '@/lib/inferStoreSection';
import MaterialAutocomplete, { type LibraryMaterial } from '@/components/MaterialAutocomplete';

interface TaskMaterial {
  id: string;
  task_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  purchased: boolean;
  delivered: boolean;
  sku: string | null;
  vendor_url: string | null;
  item_type: string;
  provided_by: string;
  confirmed_on_site: boolean;
  created_at: string;
  tool_type_id: string | null;
  is_active: boolean;
  store_section: string | null;
  store_section_manual: boolean;
}

interface TaskMaterialsSheetProps {
  taskId: string;
  projectId?: string;
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

const TaskMaterialsSheet = ({ taskId, projectId, open, onOpenChange, onMaterialsChange }: TaskMaterialsSheetProps) => {
  const { toast } = useToast();
  const { sections } = useStoreSections();
  const activeNames = sections.map(s => s.name);
  const [materials, setMaterials] = useState<TaskMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceRecipeStepId, setSourceRecipeStepId] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newUnitCost, setNewUnitCost] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newVendorUrl, setNewVendorUrl] = useState('');
  const [newItemType, setNewItemType] = useState<string>('material');
  const [newProvidedBy, setNewProvidedBy] = useState<string>('either');
  const [newStoreSection, setNewStoreSection] = useState<string>('');

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editMaterial, setEditMaterial] = useState<TaskMaterial | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editUnitCost, setEditUnitCost] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editVendorUrl, setEditVendorUrl] = useState('');
  const [editItemType, setEditItemType] = useState<string>('material');
  const [editProvidedBy, setEditProvidedBy] = useState<string>('either');
  const [editStoreSection, setEditStoreSection] = useState<string>('');
  const [editStoreSectionManual, setEditStoreSectionManual] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TaskMaterial | null>(null);
  const [leftoverTarget, setLeftoverTarget] = useState<TaskMaterial | null>(null);
  const [syncPromptOpen, setSyncPromptOpen] = useState(false);
  const [pendingSyncData, setPendingSyncData] = useState<{
    name: string; itemType: string; sku: string; vendorUrl: string;
    unitCost: string; unit: string; storeSection: string; qty: string;
  } | null>(null);

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
    if (open) {
      fetchMaterials();
      // Fetch recipe step origin for organic sync
      supabase.from('tasks').select('source_recipe_step_id').eq('id', taskId).single()
        .then(({ data }) => setSourceRecipeStepId(data?.source_recipe_step_id ?? null));
    }
  }, [open, taskId]);

  const runDerivation = async () => {
    const { data } = await supabase
      .from('task_materials')
      .select('delivered, item_type, confirmed_on_site, is_active')
      .eq('task_id', taskId);

    const allItems = (data as unknown as Pick<TaskMaterial, 'delivered' | 'item_type' | 'confirmed_on_site' | 'is_active'>[]) || [];
    const items = allItems.filter(i => i.is_active !== false);
    
    if (items.length === 0) {
      // No active materials — nothing is needed, so mark as ready
      await supabase.from('tasks').update({ materials_on_site: 'Yes' }).eq('id', taskId);
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
      await supabase.from('task_materials').update({ confirmed_on_site: true, delivered: true, purchased: true }).eq('id', material.id);
    } else if (!checked) {
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

  const handleSelectFromLibrary = (item: LibraryMaterial, target: 'new' | 'edit') => {
    if (target === 'new') {
      setNewName(item.name);
      if (item.unit_cost != null) setNewUnitCost(String(item.unit_cost));
      if (item.unit) setNewUnit(item.unit);
      if (item.sku) setNewSku(item.sku);
      if (item.vendor_url) setNewVendorUrl(item.vendor_url);
      if (item.store_section) setNewStoreSection(item.store_section);
    } else {
      setEditName(item.name);
      if (item.unit_cost != null) setEditUnitCost(String(item.unit_cost));
      if (item.unit) setEditUnit(item.unit);
      if (item.sku) setEditSku(item.sku);
      if (item.vendor_url) setEditVendorUrl(item.vendor_url);
      if (item.store_section) { setEditStoreSection(item.store_section); setEditStoreSectionManual(true); }
    }
  };

  const handleAddToLibrary = async (name: string, context: 'new' | 'edit' = 'new') => {
    const itemType = context === 'new' ? newItemType : editItemType;
    const sku = context === 'new' ? newSku : editSku;
    const vendorUrl = context === 'new' ? newVendorUrl : editVendorUrl;
    const unitCost = context === 'new' ? newUnitCost : editUnitCost;
    const unit = context === 'new' ? newUnit : editUnit;
    const storeSection = context === 'new' ? newStoreSection : editStoreSection;

    if (itemType === 'tool') {
      const { error } = await supabase.from('tool_types').insert({
        name: name.trim(),
        sku: sku.trim() || null,
        vendor_url: normalizeUrl(vendorUrl),
      });
      if (error) {
        if (error.code === '23505') toast({ title: 'Already in tool inventory' });
        else toast({ title: 'Error adding tool type', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: `"${name}" added to Tool Types` });
      }
      return;
    }
    const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');
    const { error } = await supabase.from('material_library').insert({
      name,
      normalized_name: normalized,
      unit_cost: unitCost ? parseFloat(unitCost) : null,
      sku: sku.trim() || null,
      vendor_url: normalizeUrl(vendorUrl),
      unit: unit.trim() || null,
      store_section: storeSection.trim() || null,
    });
    if (error) {
      if (error.code === '23505') toast({ title: 'Already in library' });
      else toast({ title: 'Error adding to library', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `"${name}" added to Materials Library` });
    }
  };

  /** Silently upsert to material_library or tool_types + recipe step */
  const autoSyncToLibraryAndRecipe = async (params: {
    name: string; itemType: string; sku: string; vendorUrl: string;
    unitCost: string; unit: string; storeSection: string; qty: string;
  }) => {
    const { name, itemType, sku, vendorUrl, unitCost, unit, storeSection, qty } = params;
    // 1. Upsert to library
    if (itemType === 'tool') {
      const normalized = name.toLowerCase().trim();
      const { data: existing } = await supabase.from('tool_types')
        .select('id').ilike('name', normalized).limit(1);
      if (!existing?.length) {
        await supabase.from('tool_types').insert({
          name: name.trim(), sku: sku.trim() || null, vendor_url: normalizeUrl(vendorUrl),
        });
      }
    } else {
      const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');
      const { data: existing } = await supabase.from('material_library')
        .select('id').eq('normalized_name', normalized).limit(1);
      if (!existing?.length) {
        await supabase.from('material_library').insert({
          name: name.trim(), normalized_name: normalized,
          unit_cost: unitCost ? parseFloat(unitCost) : null,
          sku: sku.trim() || null, vendor_url: normalizeUrl(vendorUrl),
          unit: unit.trim() || null, store_section: storeSection.trim() || null,
        });
      }
    }

    // 2. Add to recipe step if task originated from one
    if (sourceRecipeStepId) {
      const matName = name.trim();
      const { data: existingStep } = await supabase.from('task_recipe_step_materials')
        .select('id').eq('recipe_step_id', sourceRecipeStepId)
        .ilike('material_name', matName).limit(1);
      if (!existingStep?.length) {
        await supabase.from('task_recipe_step_materials').insert({
          recipe_step_id: sourceRecipeStepId,
          material_name: matName,
          item_type: itemType,
          qty: qty ? parseFloat(qty) : null,
          unit: unit.trim() || null,
          unit_cost: unitCost ? parseFloat(unitCost) : null,
          sku: sku.trim() || null,
          vendor_url: normalizeUrl(vendorUrl),
          store_section: storeSection.trim() || null,
        } as any);
      }
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    const autoSection = newStoreSection || inferStoreSection(newName.trim(), activeNames);
    const { error } = await supabase.from('task_materials').insert({
      task_id: taskId,
      name: newName.trim(),
      quantity: newQty ? parseFloat(newQty) : null,
      unit: newUnit.trim() || null,
      unit_cost: newUnitCost ? parseFloat(newUnitCost) : null,
      sku: newSku.trim() || null,
      vendor_url: normalizeUrl(newVendorUrl),
      item_type: newItemType,
      provided_by: newItemType === 'tool' ? newProvidedBy : 'either',
      store_section: autoSection,
      store_section_manual: !!newStoreSection,
    } as any);
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    // Organic sync: auto-add to library + recipe
    autoSyncToLibraryAndRecipe({
      name: newName, itemType: newItemType, sku: newSku, vendorUrl: newVendorUrl,
      unitCost: newUnitCost, unit: newUnit, storeSection: autoSection, qty: newQty,
    });
    setNewName(''); setNewQty(''); setNewUnit(''); setNewUnitCost(''); setNewSku(''); setNewVendorUrl('');
    setNewItemType('material'); setNewProvidedBy('either'); setNewStoreSection('');
    await fetchMaterials();
  };

  const openEdit = (m: TaskMaterial) => {
    setEditMaterial(m);
    setEditName(m.name);
    setEditQty(m.quantity?.toString() ?? '');
    setEditUnit(m.unit ?? '');
    setEditUnitCost(m.unit_cost?.toString() ?? '');
    setEditSku(m.sku ?? '');
    setEditVendorUrl(m.vendor_url ?? '');
    setEditItemType(m.item_type ?? 'material');
    setEditProvidedBy(m.provided_by ?? 'either');
    setEditStoreSection(m.store_section ?? '');
    setEditStoreSectionManual(m.store_section_manual ?? false);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editMaterial || !editName.trim()) return;
    setEditLoading(true);
    const nameChanged = editName.trim() !== editMaterial.name;
    let section = editStoreSection;
    let sectionManual = editStoreSectionManual;
    if (nameChanged && !editStoreSectionManual) {
      section = inferStoreSection(editName.trim(), activeNames);
    }
    const { error } = await supabase.from('task_materials').update({
      name: editName.trim(),
      quantity: editQty ? parseFloat(editQty) : null,
      unit: editUnit.trim() || null,
      unit_cost: editUnitCost ? parseFloat(editUnitCost) : null,
      sku: editSku.trim() || null,
      vendor_url: normalizeUrl(editVendorUrl),
      item_type: editItemType,
      provided_by: editItemType === 'tool' ? editProvidedBy : 'either',
      store_section: section || null,
      store_section_manual: sectionManual,
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

  const handleRemove = async () => {
    if (!removeTarget) return;
    await supabase.from('task_materials').update({ is_active: false } as any).eq('id', removeTarget.id);
    setRemoveTarget(null);
    await runDerivation();
    await fetchMaterials();
  };

  const handleRestore = async (m: TaskMaterial) => {
    await supabase.from('task_materials').update({ is_active: true } as any).eq('id', m.id);
    await runDerivation();
    await fetchMaterials();
  };

  const activeItems = materials.filter(m => m.is_active !== false);
  const removedItems = materials.filter(m => m.is_active === false);

  const materialItemsList = activeItems.filter(m => m.item_type !== 'tool');
  const toolItemsList = activeItems.filter(m => m.item_type === 'tool');

  const renderItemCard = (m: TaskMaterial) => (
    <div key={m.id} className="rounded-lg border p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{m.name}</p>
            {(m.quantity || m.unit || m.unit_cost != null) && (
              <p className="text-xs text-muted-foreground">
                {m.quantity}{m.unit ? ` ${m.unit}` : ''}
                {m.unit_cost != null ? ` · $${m.unit_cost.toFixed(2)}/${m.unit || 'unit'}` : ''}
                {m.quantity != null && m.unit_cost != null ? ` · $${(m.quantity * m.unit_cost).toFixed(2)} total` : ''}
              </p>
            )}
          </div>
          <div className="flex gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRemoveTarget(m)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
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

      {m.item_type === 'material' && (
        <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => setLeftoverTarget(m)}>
          <Package className="h-3 w-3" />Record leftover
        </Button>
      )}
    </div>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>📦 Materials & Tools</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="px-4 flex-1 overflow-auto" style={{ maxHeight: '50vh' }}>
          {activeItems.length === 0 && removedItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No materials or tools added yet.</p>
          )}
          {activeItems.length === 0 && removedItems.length > 0 && !showRemoved && (
            <p className="text-sm text-muted-foreground text-center py-4">All items removed. Toggle "Show removed" to see them.</p>
          )}

          {materialItemsList.length > 0 && (
            <div className="space-y-2 mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Materials</h3>
              {materialItemsList.map(renderItemCard)}
            </div>
          )}

          {toolItemsList.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🔧 Tools</h3>
              {toolItemsList.map(renderItemCard)}
            </div>
          )}

          {removedItems.length > 0 && (
            <div className="pt-3 mt-3 border-t space-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={showRemoved} onCheckedChange={setShowRemoved} id="show-removed" />
                <Label htmlFor="show-removed" className="text-xs text-muted-foreground">Show removed ({removedItems.length})</Label>
              </div>
              {showRemoved && removedItems.map(m => (
                <div key={m.id} className="rounded-lg border border-dashed p-3 opacity-60 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm line-through">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.item_type === 'tool' ? 'Tool' : 'Material'}{m.quantity ? ` · ${m.quantity}${m.unit ? ` ${m.unit}` : ''}` : ''}</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleRestore(m)}>
                    <RotateCcw className="h-3 w-3" />Restore
                  </Button>
                </div>
              ))}
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
            <MaterialAutocomplete
              value={newName}
              onChange={setNewName}
              onSelect={(item) => handleSelectFromLibrary(item, 'new')}
              onAddToLibrary={(name) => handleAddToLibrary(name, 'new')}
              itemType={newItemType === 'tool' ? 'tool' : 'material'}
              onSelectTool={(tool) => {
                setNewName(tool.name);
                if (tool.sku) setNewSku(tool.sku);
                if (tool.vendor_url) setNewVendorUrl(tool.vendor_url);
              }}
              className="flex-1"
            />
            <Input placeholder="Qty" type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-16" />
            <Input placeholder="Unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="w-16" />
            <Input placeholder="$/unit" type="number" step="0.01" value={newUnitCost} onChange={(e) => setNewUnitCost(e.target.value)} className="w-20" />
          </div>
          <div className="flex gap-2">
            <Input placeholder="SKU (optional)" value={newSku} onChange={(e) => setNewSku(e.target.value)} className="flex-1" />
            <Input placeholder="Vendor URL (optional)" value={newVendorUrl} onChange={(e) => setNewVendorUrl(e.target.value)} className="flex-1" />
          </div>
          <Select value={newStoreSection || '__auto'} onValueChange={(v) => setNewStoreSection(v === '__auto' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Store section (auto)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto">Auto-detect section</SelectItem>
              {activeNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
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
              <MaterialAutocomplete
                value={editName}
                onChange={setEditName}
                onSelect={(item) => handleSelectFromLibrary(item, 'edit')}
                onAddToLibrary={(name) => handleAddToLibrary(name, 'edit')}
              />
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
              <div className="flex-1">
                <Label className="text-xs">Unit Cost</Label>
                <Input type="number" step="0.01" value={editUnitCost} onChange={(e) => setEditUnitCost(e.target.value)} />
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
            <div>
              <Label className="text-xs">Store Section</Label>
              <div className="flex gap-1.5">
                <Select value={editStoreSection || '__auto'} onValueChange={(v) => {
                  if (v === '__auto') {
                    setEditStoreSection(inferStoreSection(editName, activeNames));
                    setEditStoreSectionManual(false);
                  } else {
                    setEditStoreSection(v);
                    setEditStoreSectionManual(true);
                  }
                }}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto">Auto-detect</SelectItem>
                    {activeNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {editStoreSectionManual && (
                  <Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => {
                    setEditStoreSection(inferStoreSection(editName, activeNames));
                    setEditStoreSectionManual(false);
                  }}>Use auto</Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editLoading || !editName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>"{removeTarget?.name}"</strong> from this task's requirements and the project rollup. It will <strong>NOT</strong> affect inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {leftoverTarget && (
        <RecordLeftoverSheet
          open={!!leftoverTarget}
          onOpenChange={(o) => { if (!o) setLeftoverTarget(null); }}
          prefill={{
            name: leftoverTarget.name,
            unit: leftoverTarget.unit,
            sku: leftoverTarget.sku,
            vendor_url: leftoverTarget.vendor_url,
          }}
          projectId={projectId ?? null}
        />
      )}
    </Drawer>
  );
};

export default TaskMaterialsSheet;
