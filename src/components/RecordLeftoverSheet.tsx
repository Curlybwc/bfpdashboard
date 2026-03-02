import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
}

interface RecordLeftoverSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: {
    name: string;
    unit: string | null;
    sku: string | null;
    vendor_url: string | null;
  };
  projectId: string | null; // current project context, if any
  onSaved?: () => void;
}

const RecordLeftoverSheet = ({ open, onOpenChange, prefill, projectId, onSaved }: RecordLeftoverSheetProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [sku, setSku] = useState('');
  const [vendorUrl, setVendorUrl] = useState('');
  const [location, setLocation] = useState<string>(projectId ? 'project' : 'shop');
  const [saving, setSaving] = useState(false);

  // Reset form when opened with new prefill
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setName(prefill.name);
      setQty('');
      setUnit(prefill.unit ?? '');
      setSku(prefill.sku ?? '');
      setVendorUrl(prefill.vendor_url ?? '');
      setLocation(projectId ? 'project' : 'shop');
    }
    onOpenChange(o);
  };

  const handleSave = async () => {
    if (!name.trim() || !qty.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('material_inventory').insert({
      name: name.trim(),
      qty: parseFloat(qty),
      unit: unit.trim() || null,
      sku: sku.trim() || null,
      vendor_url: normalizeUrl(vendorUrl),
      location_type: location,
      project_id: location === 'project' ? projectId : null,
      status: 'available',
      updated_by: user?.id,
    } as any);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Leftover recorded', description: `${name.trim()} added to inventory.` });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle>Record Leftover</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Leftover Qty *</Label>
              <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="Required" />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Unit</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">SKU (optional)</Label>
            <Input value={sku} onChange={e => setSku(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Vendor URL (optional)</Label>
            <Input value={vendorUrl} onChange={e => setVendorUrl(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Location</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shop">Shop</SelectItem>
                {projectId && <SelectItem value="project">This JobSite</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DrawerFooter className="gap-2">
          <Button onClick={handleSave} disabled={saving || !name.trim() || !qty.trim()}>
            Save Leftover
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default RecordLeftoverSheet;
