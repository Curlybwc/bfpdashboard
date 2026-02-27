import { useState, useEffect } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TaskMaterial {
  id: string;
  task_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  purchased: boolean;
  delivered: boolean;
  created_at: string;
}

interface TaskMaterialsSheetProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMaterialsChange: () => void;
}

const TaskMaterialsSheet = ({ taskId, open, onOpenChange, onMaterialsChange }: TaskMaterialsSheetProps) => {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<TaskMaterial[]>([]);
  const [loading, setLoading] = useState(false);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('');

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
    setMaterials((data as TaskMaterial[]) || []);
  };

  useEffect(() => {
    if (open) fetchMaterials();
  }, [open, taskId]);

  // Derivation: only called after delivered changes
  const runDerivation = async () => {
    const { data } = await supabase
      .from('task_materials')
      .select('delivered')
      .eq('task_id', taskId);

    const items = data || [];
    let newStatus: 'Yes' | 'No' = 'No';
    if (items.length > 0 && items.every((m: any) => m.delivered === true)) {
      newStatus = 'Yes';
    }

    await supabase.from('tasks').update({ materials_on_site: newStatus }).eq('id', taskId);
    onMaterialsChange();
  };

  const handlePurchasedToggle = async (material: TaskMaterial, checked: boolean) => {
    if (checked) {
      // Rule: purchased ON → just set purchased = true
      await supabase.from('task_materials').update({ purchased: true }).eq('id', material.id);
    } else {
      // Rule A: purchased OFF → set purchased = false AND delivered = false
      await supabase.from('task_materials').update({ purchased: false, delivered: false }).eq('id', material.id);
      // Delivered changed implicitly, run derivation
      await runDerivation();
    }
    await fetchMaterials();
  };

  const handleDeliveredToggle = async (material: TaskMaterial, checked: boolean) => {
    if (checked) {
      // Rule B: delivered ON → set delivered = true, purchased = true
      await supabase.from('task_materials').update({ delivered: true, purchased: true }).eq('id', material.id);
    } else {
      // delivered OFF → set delivered = false
      await supabase.from('task_materials').update({ delivered: false }).eq('id', material.id);
    }
    await runDerivation();
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
    });
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName('');
    setNewQty('');
    setNewUnit('');
    await fetchMaterials();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>📦 Materials</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="px-4 flex-1 overflow-auto" style={{ maxHeight: '50vh' }}>
          {materials.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No materials added yet.</p>
          )}
          <div className="space-y-3">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  {(m.quantity || m.unit) && (
                    <p className="text-xs text-muted-foreground">
                      {m.quantity}{m.unit ? ` ${m.unit}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-center gap-0.5">
                    <Switch
                      checked={m.purchased}
                      onCheckedChange={(c) => handlePurchasedToggle(m, c)}
                    />
                    <span className="text-[10px] text-muted-foreground">Bought</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 opacity-75">
                    <Switch
                      checked={m.delivered}
                      onCheckedChange={(c) => handleDeliveredToggle(m, c)}
                    />
                    <span className="text-[10px] text-muted-foreground">On Site</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="px-4 pt-3 pb-1 border-t space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Add Material</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Name *"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Qty"
              type="number"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="w-16"
            />
            <Input
              placeholder="Unit"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              className="w-16"
            />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={loading || !newName.trim()} className="w-full">
            Add
          </Button>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default TaskMaterialsSheet;
