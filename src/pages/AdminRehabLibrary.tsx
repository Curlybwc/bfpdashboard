import { useEffect, useState, useCallback } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ChevronRight, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface RehabTemplate {
  id: string;
  name: string;
  category: string | null;
  keywords: string[] | null;
  active: boolean;
}

interface RehabItem {
  id: string;
  library_id: string;
  description: string;
  trade: string | null;
  recipe_hint_id: string | null;
  default_status: string;
  sort_order: number;
}

interface RecipeOption {
  id: string;
  name: string;
}

const SCOPE_STATUSES = ['OK', 'Repair', 'Replace', 'Get Bid'];

const SortableRehabItem = ({ item, onDelete }: { item: RehabItem; onDelete: () => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <Card ref={setNodeRef} style={style} className={cn('p-2 flex items-center gap-2', isDragging && 'opacity-50 z-50')}>
      <button
        className="shrink-0 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-none"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.description}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {item.trade && <Badge variant="secondary" className="text-[10px]">{item.trade}</Badge>}
          <Badge variant="outline" className="text-[10px]">{item.default_status}</Badge>
          {item.recipe_hint_id && (
            <Badge variant="default" className="text-[10px]">Recipe linked</Badge>
          )}
        </div>
      </div>
      <button onClick={onDelete} className="text-muted-foreground hover:text-destructive shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </Card>
  );
};

const AdminRehabLibrary = () => {
  const { isAdmin, canManageProjects, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<RehabTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<RehabTemplate | null>(null);
  const [items, setItems] = useState<RehabItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newKeywords, setNewKeywords] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editKeywords, setEditKeywords] = useState('');

  // New item form
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemTrade, setNewItemTrade] = useState('');
  const [newItemStatus, setNewItemStatus] = useState('Repair');
  const [newItemRecipeHint, setNewItemRecipeHint] = useState('');

  const canAccess = isAdmin || canManageProjects;

  useEffect(() => {
    if (!adminLoading && !canAccess) {
      navigate('/projects', { replace: true });
    }
  }, [canAccess, adminLoading, navigate]);

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from('rehab_library')
      .select('*')
      .order('name');
    if (data) setTemplates(data as RehabTemplate[]);
  };

  const fetchItems = async (libraryId: string) => {
    const { data } = await supabase
      .from('rehab_library_items')
      .select('*')
      .eq('library_id', libraryId)
      .order('sort_order');
    if (data) setItems(data as RehabItem[]);
  };

  const fetchRecipes = async () => {
    const { data } = await supabase
      .from('task_recipes')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setRecipes(data);
  };

  useEffect(() => {
    if (canAccess) {
      fetchTemplates();
      fetchRecipes();
    }
  }, [canAccess]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    const keywords = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const { error } = await supabase.from('rehab_library').insert({
      name: newName.trim(),
      category: newCategory.trim() || null,
      keywords: keywords.length > 0 ? keywords : null,
      created_by: user.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName(''); setNewCategory(''); setNewKeywords('');
    setCreateOpen(false);
    fetchTemplates();
    toast({ title: 'Template created' });
  };

  const selectTemplate = (t: RehabTemplate) => {
    setSelectedTemplate(t);
    setEditName(t.name);
    setEditCategory(t.category || '');
    setEditKeywords((t.keywords || []).join(', '));
    fetchItems(t.id);
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;
    const keywords = editKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const { error } = await supabase.from('rehab_library').update({
      name: editName.trim(),
      category: editCategory.trim() || null,
      keywords: keywords.length > 0 ? keywords : null,
    }).eq('id', selectedTemplate.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Template updated' });
    fetchTemplates();
    setSelectedTemplate({ ...selectedTemplate, name: editName.trim(), category: editCategory.trim() || null, keywords: keywords.length > 0 ? keywords : null });
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    const { error } = await supabase.from('rehab_library').delete().eq('id', selectedTemplate.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Template deleted' });
    setSelectedTemplate(null);
    setItems([]);
    fetchTemplates();
  };

  const handleAddItem = async () => {
    if (!selectedTemplate || !newItemDesc.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order)) : 0;
    const { error } = await supabase.from('rehab_library_items').insert({
      library_id: selectedTemplate.id,
      description: newItemDesc.trim(),
      trade: newItemTrade.trim() || null,
      default_status: newItemStatus,
      recipe_hint_id: newItemRecipeHint || null,
      sort_order: maxOrder + 10,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewItemDesc(''); setNewItemTrade(''); setNewItemStatus('Repair'); setNewItemRecipeHint('');
    fetchItems(selectedTemplate.id);
  };

  const handleDeleteItem = async (itemId: string) => {
    const { error } = await supabase.from('rehab_library_items').delete().eq('id', itemId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (selectedTemplate) fetchItems(selectedTemplate.id);
  };

  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleItemDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setItems(reordered);

    const updates = reordered.map((item, i) =>
      supabase.from('rehab_library_items').update({ sort_order: (i + 1) * 10 }).eq('id', item.id)
    );
    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error);
    if (firstError?.error) {
      toast({ title: 'Error', description: firstError.error.message, variant: 'destructive' });
      if (selectedTemplate) fetchItems(selectedTemplate.id);
    }
  }, [items, toast, selectedTemplate]);

  if (adminLoading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  if (!canAccess) return null;

  // Detail view
  if (selectedTemplate) {
    return (
      <div className="pb-20">
        <PageHeader title={selectedTemplate.name} backTo="/admin" actions={
          <Button size="sm" variant="ghost" onClick={() => { setSelectedTemplate(null); setItems([]); }}>Back to list</Button>
        } />
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Keywords (comma-separated)</Label>
            <Input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} placeholder="bathroom, bath, 5x7 bath, ..." />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveTemplate} className="flex-1">Save Template</Button>
            <Button variant="destructive" size="icon" onClick={handleDeleteTemplate}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <Label>Scope Items ({items.length})</Label>
            <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {items.map((item) => (
                    <SortableRehabItem key={item.id} item={item} onDelete={() => handleDeleteItem(item.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="space-y-2 border rounded-md p-3">
              <Input placeholder="Item description" value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Trade" value={newItemTrade} onChange={(e) => setNewItemTrade(e.target.value)} />
                <Select value={newItemStatus} onValueChange={setNewItemStatus}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCOPE_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={newItemRecipeHint || '__none'} onValueChange={(v) => setNewItemRecipeHint(v === '__none' ? '' : v)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Recipe hint (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {recipes.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAddItem} disabled={!newItemDesc.trim()} className="w-full">
                <Plus className="h-4 w-4 mr-1" />Add Item
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="pb-20">
      <PageHeader
        title="Rehab Library"
        backTo="/admin"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Template
          </Button>
        }
      />
      <div className="p-4">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No rehab templates yet.</p>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <Card key={t.id} className="p-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => selectTemplate(t)}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{t.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {t.category && <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Rehab Template</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Keywords (comma-separated)</Label>
              <Input value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="bathroom, bath, 5x7 bath, ..." />
            </div>
            <Button type="submit" className="w-full">Create Template</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRehabLibrary;
