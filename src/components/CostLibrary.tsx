import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Search, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type CostItem = Tables<'cost_items'>;
type UnitType = 'each' | 'sqft' | 'lf' | 'piece';

const UNIT_TYPES: UnitType[] = ['each', 'sqft', 'lf', 'piece'];

const CostLibrary = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<CostItem[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CostItem>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', unit_type: 'each' as UnitType, piece_length_ft: '', default_total_cost: '', active: true });

  const fetchItems = async () => {
    const { data } = await supabase.from('cost_items').select('*').order('name');
    if (data) setItems(data);
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const startEdit = (item: CostItem) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, unit_type: item.unit_type, piece_length_ft: item.piece_length_ft, default_total_cost: item.default_total_cost });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from('cost_items').update({
      name: editForm.name,
      unit_type: editForm.unit_type,
      piece_length_ft: editForm.piece_length_ft === null ? null : editForm.piece_length_ft,
      default_total_cost: Number(editForm.default_total_cost),
    }).eq('id', editingId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setEditingId(null);
    fetchItems();
  };

  const toggleActive = async (item: CostItem) => {
    const { error } = await supabase.from('cost_items').update({ active: !item.active }).eq('id', item.id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from('cost_items').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    fetchItems();
  };

  const addItem = async () => {
    if (!addForm.name.trim() || !addForm.default_total_cost) return;
    const { error } = await supabase.from('cost_items').insert({
      name: addForm.name.trim(),
      unit_type: addForm.unit_type,
      piece_length_ft: addForm.piece_length_ft ? Number(addForm.piece_length_ft) : null,
      default_total_cost: Number(addForm.default_total_cost),
      active: addForm.active,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setShowAdd(false);
    setAddForm({ name: '', unit_type: 'each', piece_length_ft: '', default_total_cost: '', active: true });
    fetchItems();
  };

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search cost items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Cost Item</DialogTitle>
              <DialogDescription>Create a new cost item for the library.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>Unit Type</Label>
                <Select value={addForm.unit_type} onValueChange={v => setAddForm(f => ({ ...f, unit_type: v as UnitType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Piece Length (ft)</Label>
                <Input type="number" value={addForm.piece_length_ft} onChange={e => setAddForm(f => ({ ...f, piece_length_ft: e.target.value }))} />
              </div>
              <div>
                <Label>Default Total Cost *</Label>
                <Input type="number" value={addForm.default_total_cost} onChange={e => setAddForm(f => ({ ...f, default_total_cost: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <Label>Active</Label>
                <Switch checked={addForm.active} onCheckedChange={v => setAddForm(f => ({ ...f, active: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addItem} disabled={!addForm.name.trim() || !addForm.default_total_cost}>Add Item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Piece Len (ft)</TableHead>
            <TableHead>Default Cost</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No cost items found.</TableCell></TableRow>
          )}
          {filtered.map(item => (
            <TableRow key={item.id}>
              {editingId === item.id ? (
                <>
                  <TableCell><Input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-8" /></TableCell>
                  <TableCell>
                    <Select value={editForm.unit_type ?? 'each'} onValueChange={v => setEditForm(f => ({ ...f, unit_type: v as UnitType }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_TYPES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" value={editForm.piece_length_ft ?? ''} onChange={e => setEditForm(f => ({ ...f, piece_length_ft: e.target.value ? Number(e.target.value) : null }))} className="h-8" /></TableCell>
                  <TableCell><Input type="number" value={editForm.default_total_cost ?? ''} onChange={e => setEditForm(f => ({ ...f, default_total_cost: Number(e.target.value) }))} className="h-8" /></TableCell>
                  <TableCell><Switch checked={item.active} onCheckedChange={() => toggleActive(item)} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.unit_type}</TableCell>
                  <TableCell>{item.piece_length_ft ?? '—'}</TableCell>
                  <TableCell>{fmt(item.default_total_cost)}</TableCell>
                  <TableCell><Switch checked={item.active} onCheckedChange={() => toggleActive(item)} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteItem(item.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default CostLibrary;
