import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStoreSections } from '@/hooks/useStoreSections';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

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
}

interface StepMaterialsEditorProps {
  stepId: string;
}

const StepMaterialsEditor = ({ stepId }: StepMaterialsEditorProps) => {
  const { toast } = useToast();
  const { sections: storeSections } = useStoreSections();
  const [materials, setMaterials] = useState<StepMaterial[]>([]);

  const [matName, setMatName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('');
  const [matStoreSection, setMatStoreSection] = useState('');
  const [matSku, setMatSku] = useState('');
  const [matVendorUrl, setMatVendorUrl] = useState('');
  const [matProvidedBy, setMatProvidedBy] = useState('either');
  const [matFormula, setMatFormula] = useState('');

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

  const handleAdd = async () => {
    if (!matName.trim()) return;
    const { error } = await supabase.from('task_recipe_step_materials').insert({
      recipe_step_id: stepId,
      material_name: matName.trim(),
      qty: matQty ? parseFloat(matQty) : null,
      unit: matUnit.trim() || null,
      store_section: matStoreSection || null,
      sku: matSku.trim() || null,
      vendor_url: matVendorUrl.trim() || null,
      provided_by: matProvidedBy || 'either',
      qty_formula: matFormula.trim() || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setMatName(''); setMatQty(''); setMatUnit(''); setMatStoreSection(''); setMatSku(''); setMatVendorUrl(''); setMatProvidedBy('either'); setMatFormula('');
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

  return (
    <div className="ml-6 mt-1 mb-2 space-y-1.5 border-l-2 border-muted pl-3">
      <p className="text-xs font-medium text-muted-foreground">Materials (applied to task on expand)</p>
      {materials.map(mat => (
        <div key={mat.id} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate">{mat.material_name}</span>
          {mat.qty_formula ? (
            <Badge variant="default" className="text-[9px] font-mono">{mat.qty_formula}</Badge>
          ) : mat.qty != null ? (
            <span className="text-muted-foreground">{mat.qty} {mat.unit || ''}</span>
          ) : null}
          {mat.qty_formula && mat.qty != null && (
            <span className="text-muted-foreground text-[9px]">(fallback: {mat.qty})</span>
          )}
          {mat.store_section && <Badge variant="secondary" className="text-[9px]">{mat.store_section}</Badge>}
          {mat.sku && <Badge variant="outline" className="text-[9px]">{mat.sku}</Badge>}
          {mat.provided_by && mat.provided_by !== 'either' && <Badge variant="outline" className="text-[9px]">{mat.provided_by}</Badge>}
          <button onClick={() => handleDelete(mat.id)} className="text-muted-foreground hover:text-destructive shrink-0">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-5 gap-1">
        <Input placeholder="Material" value={matName} onChange={e => setMatName(e.target.value)} className="h-7 text-xs col-span-2" />
        <Input placeholder="Qty" type="number" value={matQty} onChange={e => setMatQty(e.target.value)} className="h-7 text-xs" />
        <Input placeholder="Unit" value={matUnit} onChange={e => setMatUnit(e.target.value)} className="h-7 text-xs" />
        <Button size="sm" onClick={handleAdd} disabled={!matName.trim()} className="h-7 text-xs">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-1">
        <Input placeholder="Qty Formula (e.g. room_sqft * 1.1)" value={matFormula} onChange={e => setMatFormula(e.target.value)} className="h-7 text-xs" />
        <p className="text-[10px] text-muted-foreground">Variables: room_sqft, perimeter_ft, task_qty</p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <Select value={matStoreSection} onValueChange={setMatStoreSection}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">None</SelectItem>
            {storeSections.map(s => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="SKU" value={matSku} onChange={e => setMatSku(e.target.value)} className="h-7 text-xs" />
        <Select value={matProvidedBy} onValueChange={setMatProvidedBy}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Provided by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="either">Either</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="contractor">Contractor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input placeholder="Vendor URL" value={matVendorUrl} onChange={e => setMatVendorUrl(e.target.value)} className="h-7 text-xs" />
    </div>
  );
};

export default StepMaterialsEditor;
