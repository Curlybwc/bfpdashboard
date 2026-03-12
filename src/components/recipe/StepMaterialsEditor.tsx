import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useStoreSections } from '@/hooks/useStoreSections';
import { useToast } from '@/hooks/use-toast';
import { inferStoreSection } from '@/lib/inferStoreSection';
import MaterialAutocomplete, { type LibraryMaterial } from '@/components/MaterialAutocomplete';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface StepMaterial {
  id: string;
  recipe_step_id: string;
  material_name: string;
  qty: number | null;
  unit: string | null;
  sku: string | null;
  vendor_url: string | null;
  store_section: string | null;
  provided_by: string | null;
  notes: string | null;
  qty_formula: string | null;
  item_type: string;
  unit_cost: number | null;
}

interface StepMaterialsEditorProps {
  stepId: string;
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

const StepMaterialsEditor = ({ stepId }: StepMaterialsEditorProps) => {
  const { toast } = useToast();
  const { sections: storeSections } = useStoreSections();
  const activeNames = storeSections.map(s => s.name);
  const [materials, setMaterials] = useState<StepMaterial[]>([]);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newUnitCost, setNewUnitCost] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newVendorUrl, setNewVendorUrl] = useState('');
  const [newItemType, setNewItemType] = useState<string>('material');
  const [newProvidedBy, setNewProvidedBy] = useState<string>('either');
  const [newStoreSection, setNewStoreSection] = useState('');
  const [newFormula, setNewFormula] = useState('');

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editMat, setEditMat] = useState<StepMaterial | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editUnitCost, setEditUnitCost] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editVendorUrl, setEditVendorUrl] = useState('');
  const [editItemType, setEditItemType] = useState<string>('material');
  const [editProvidedBy, setEditProvidedBy] = useState<string>('either');
  const [editStoreSection, setEditStoreSection] = useState('');
  const [editFormula, setEditFormula] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const fetchMaterials = async () => {
    const { data } = await supabase
      .from('task_recipe_step_materials')
      .select('*')
      .eq('recipe_step_id', stepId)
      .order('created_at');
    if (data) setMaterials(data as StepMaterial[]);
  };

  useEffect(() => {
    fetchMaterials();
  }, [stepId]);

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
      if (item.store_section) setEditStoreSection(item.store_section);
    }
  };

  const handleAddToLibrary = async (name: string, itemType: string = 'material') => {
    if (itemType === 'tool') {
      const sku = itemType === newItemType ? newSku : editSku;
      const vendorUrl = itemType === newItemType ? newVendorUrl : editVendorUrl;
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
    const sku = itemType === newItemType ? newSku : editSku;
    const vendorUrl = itemType === newItemType ? newVendorUrl : editVendorUrl;
    const unitCost = itemType === newItemType ? newUnitCost : editUnitCost;
    const unit = itemType === newItemType ? newUnit : editUnit;
    const storeSection = itemType === newItemType ? newStoreSection : editStoreSection;
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

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const autoSection = newStoreSection || inferStoreSection(newName.trim(), activeNames);
    const { error } = await supabase.from('task_recipe_step_materials').insert({
      recipe_step_id: stepId,
      material_name: newName.trim(),
      qty: newQty ? parseFloat(newQty) : null,
      unit: newUnit.trim() || null,
      unit_cost: newUnitCost ? parseFloat(newUnitCost) : null,
      store_section: autoSection || null,
      sku: newSku.trim() || null,
      vendor_url: normalizeUrl(newVendorUrl),
      provided_by: newItemType === 'tool' ? newProvidedBy : 'either',
      qty_formula: newFormula.trim() || null,
      item_type: newItemType,
    } as any);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName(''); setNewQty(''); setNewUnit(''); setNewUnitCost('');
    setNewSku(''); setNewVendorUrl(''); setNewStoreSection('');
    setNewItemType('material'); setNewProvidedBy('either'); setNewFormula('');
    fetchMaterials();
  };

  const handleDelete = async (matId: string) => {
    const { error } = await supabase.from('task_recipe_step_materials').delete().eq('id', matId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    fetchMaterials();
  };

  const openEdit = (m: StepMaterial) => {
    setEditMat(m);
    setEditName(m.material_name);
    setEditQty(m.qty?.toString() ?? '');
    setEditUnit(m.unit ?? '');
    setEditUnitCost(m.unit_cost?.toString() ?? '');
    setEditSku(m.sku ?? '');
    setEditVendorUrl(m.vendor_url ?? '');
    setEditItemType(m.item_type ?? 'material');
    setEditProvidedBy(m.provided_by ?? 'either');
    setEditStoreSection(m.store_section ?? '');
    setEditFormula(m.qty_formula ?? '');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editMat || !editName.trim()) return;
    setEditLoading(true);
    const { error } = await supabase.from('task_recipe_step_materials').update({
      material_name: editName.trim(),
      qty: editQty ? parseFloat(editQty) : null,
      unit: editUnit.trim() || null,
      unit_cost: editUnitCost ? parseFloat(editUnitCost) : null,
      sku: editSku.trim() || null,
      vendor_url: normalizeUrl(editVendorUrl),
      item_type: editItemType,
      provided_by: editItemType === 'tool' ? editProvidedBy : 'either',
      store_section: editStoreSection || null,
      qty_formula: editFormula.trim() || null,
    } as any).eq('id', editMat.id);
    setEditLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setEditOpen(false);
    fetchMaterials();
  };

  const materialItems = materials.filter(m => m.item_type !== 'tool');
  const toolItems = materials.filter(m => m.item_type === 'tool');

  const renderItemCard = (mat: StepMaterial) => (
    <div key={mat.id} className="rounded-lg border p-2.5 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{mat.material_name}</p>
          <p className="text-xs text-muted-foreground">
            {mat.qty != null && <>{mat.qty}{mat.unit ? ` ${mat.unit}` : ''}</>}
            {mat.unit_cost != null && <> · ${mat.unit_cost.toFixed(2)}/{mat.unit || 'unit'}</>}
            {mat.qty != null && mat.unit_cost != null && <> · ${(mat.qty * mat.unit_cost).toFixed(2)} total</>}
          </p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button onClick={() => openEdit(mat)} className="p-1 text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => handleDelete(mat.id)} className="p-1 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {mat.qty_formula && <Badge variant="default" className="text-[9px] font-mono">{mat.qty_formula}</Badge>}
        {mat.store_section && <Badge variant="secondary" className="text-[9px]">{mat.store_section}</Badge>}
        {mat.sku && <Badge variant="outline" className="text-[9px]">{mat.sku}</Badge>}
        {mat.provided_by && mat.provided_by !== 'either' && <Badge variant="outline" className="text-[9px]">{mat.provided_by}</Badge>}
      </div>
    </div>
  );

  return (
    <div className="ml-6 mt-1 mb-2 space-y-2 border-l-2 border-muted pl-3">
      <p className="text-xs font-medium text-muted-foreground">Materials & Tools (applied on expand)</p>

      {materialItems.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Materials</h4>
          {materialItems.map(renderItemCard)}
        </div>
      )}

      {toolItems.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">🔧 Tools</h4>
          {toolItems.map(renderItemCard)}
        </div>
      )}

      {/* Add form */}
      <div className="space-y-1.5 pt-1 border-t border-dashed">
        <div className="flex items-center gap-2">
          <Label className="text-[10px] font-medium text-muted-foreground">Add</Label>
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
        <div className="flex gap-1.5">
          <MaterialAutocomplete
            value={newName}
            onChange={setNewName}
            onSelect={(item) => handleSelectFromLibrary(item, 'new')}
            onAddToLibrary={handleAddToLibrary}
            className="flex-1"
          />
          <Input placeholder="Qty" type="number" value={newQty} onChange={e => setNewQty(e.target.value)} className="h-7 text-xs w-14" />
          <Input placeholder="Unit" value={newUnit} onChange={e => setNewUnit(e.target.value)} className="h-7 text-xs w-14" />
          <Input placeholder="$/unit" type="number" step="0.01" value={newUnitCost} onChange={e => setNewUnitCost(e.target.value)} className="h-7 text-xs w-16" />
        </div>
        <div className="flex gap-1.5">
          <Input placeholder="SKU" value={newSku} onChange={e => setNewSku(e.target.value)} className="h-7 text-xs flex-1" />
          <Input placeholder="Vendor URL" value={newVendorUrl} onChange={e => setNewVendorUrl(e.target.value)} className="h-7 text-xs flex-1" />
        </div>
        <div className="flex gap-1.5">
          <Select value={newStoreSection || '__auto'} onValueChange={(v) => setNewStoreSection(v === '__auto' ? '' : v)}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Store section (auto)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto">Auto-detect section</SelectItem>
              {activeNames.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Qty Formula (e.g. room_sqft * 1.1)" value={newFormula} onChange={e => setNewFormula(e.target.value)} className="h-7 text-xs flex-1" />
        </div>
        <p className="text-[10px] text-muted-foreground">Formula variables: room_sqft, perimeter_ft, task_qty</p>
        <Button size="sm" onClick={handleAdd} disabled={!newName.trim()} className="h-7 text-xs w-full">
          <Plus className="h-3 w-3 mr-1" />Add {newItemType === 'tool' ? 'Tool' : 'Material'}
        </Button>
      </div>

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
                onAddToLibrary={handleAddToLibrary}
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
              <Select value={editStoreSection || '__auto'} onValueChange={(v) => setEditStoreSection(v === '__auto' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto">Auto-detect</SelectItem>
                  {activeNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Qty Formula</Label>
              <Input value={editFormula} onChange={(e) => setEditFormula(e.target.value)} placeholder="e.g. room_sqft * 1.1" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Variables: room_sqft, perimeter_ft, task_qty</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editLoading || !editName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StepMaterialsEditor;
