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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStoreSections } from '@/hooks/useStoreSections';
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, ChevronUp, Package } from 'lucide-react';

interface Recipe {
  id: string;
  name: string;
  trade: string | null;
  keywords: string[];
  estimated_cost: number | null;
  last_actual_avg: number | null;
  last_actual_count: number;
  active: boolean;
}

interface RecipeStep {
  id: string;
  recipe_id: string;
  title: string;
  sort_order: number;
  trade: string | null;
  notes: string | null;
  is_optional: boolean;
}

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
}

const AdminRecipes = () => {
  const { isAdmin, canManageProjects, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sections: storeSections } = useStoreSections();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newTrade, setNewTrade] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newEstCost, setNewEstCost] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editTrade, setEditTrade] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editEstCost, setEditEstCost] = useState('');

  // New step
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepTrade, setNewStepTrade] = useState('');

  // Step materials
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [stepMaterials, setStepMaterials] = useState<StepMaterial[]>([]);
  const [newMatName, setNewMatName] = useState('');
  const [newMatQty, setNewMatQty] = useState('');
  const [newMatUnit, setNewMatUnit] = useState('');
  const [newMatStore, setNewMatStore] = useState('');
  const [newMatSku, setNewMatSku] = useState('');

  const canAccess = isAdmin || canManageProjects;

  useEffect(() => {
    if (!adminLoading && !canAccess) {
      navigate('/projects', { replace: true });
    }
  }, [canAccess, adminLoading, navigate]);

  const fetchRecipes = async () => {
    const { data } = await supabase
      .from('task_recipes')
      .select('*')
      .order('name');
    if (data) setRecipes(data as Recipe[]);
  };

  const fetchSteps = async (recipeId: string) => {
    const { data } = await supabase
      .from('task_recipe_steps')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('sort_order');
    if (data) setSteps(data as RecipeStep[]);
  };

  const fetchStepMaterials = async (stepId: string) => {
    const { data } = await supabase
      .from('task_recipe_step_materials')
      .select('*')
      .eq('recipe_step_id', stepId)
      .order('created_at');
    if (data) setStepMaterials(data as StepMaterial[]);
  };

  useEffect(() => {
    if (canAccess) fetchRecipes();
  }, [canAccess]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    const keywords = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const { error } = await supabase.from('task_recipes').insert({
      name: newName.trim(),
      trade: newTrade.trim() || null,
      keywords,
      estimated_cost: newEstCost ? parseFloat(newEstCost) : null,
      created_by: user.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName(''); setNewTrade(''); setNewKeywords(''); setNewEstCost('');
    setCreateOpen(false);
    fetchRecipes();
    toast({ title: 'Recipe created' });
  };

  const selectRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setEditName(recipe.name);
    setEditTrade(recipe.trade || '');
    setEditKeywords(recipe.keywords.join(', '));
    setEditEstCost(recipe.estimated_cost?.toString() || '');
    setExpandedStepId(null);
    setStepMaterials([]);
    fetchSteps(recipe.id);
  };

  const handleSaveRecipe = async () => {
    if (!selectedRecipe) return;
    const keywords = editKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const { error } = await supabase.from('task_recipes').update({
      name: editName.trim(),
      trade: editTrade.trim() || null,
      keywords,
      estimated_cost: editEstCost ? parseFloat(editEstCost) : null,
    }).eq('id', selectedRecipe.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recipe updated' });
    fetchRecipes();
    setSelectedRecipe({ ...selectedRecipe, name: editName.trim(), trade: editTrade.trim() || null, keywords, estimated_cost: editEstCost ? parseFloat(editEstCost) : null });
  };

  const handleDeleteRecipe = async () => {
    if (!selectedRecipe) return;
    const { error } = await supabase.from('task_recipes').delete().eq('id', selectedRecipe.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recipe deleted' });
    setSelectedRecipe(null);
    setSteps([]);
    fetchRecipes();
  };

  const handleAddStep = async () => {
    if (!selectedRecipe || !newStepTitle.trim()) return;
    const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.sort_order)) : 0;
    const { error } = await supabase.from('task_recipe_steps').insert({
      recipe_id: selectedRecipe.id,
      title: newStepTitle.trim(),
      sort_order: maxOrder + 10,
      trade: newStepTrade.trim() || null,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewStepTitle(''); setNewStepTrade('');
    fetchSteps(selectedRecipe.id);
  };

  const handleDeleteStep = async (stepId: string) => {
    const { error } = await supabase.from('task_recipe_steps').delete().eq('id', stepId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (expandedStepId === stepId) {
      setExpandedStepId(null);
      setStepMaterials([]);
    }
    if (selectedRecipe) fetchSteps(selectedRecipe.id);
  };

  const handleMoveStep = async (stepId: string, direction: 'up' | 'down') => {
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= steps.length) return;
    const a = steps[idx];
    const b = steps[swapIdx];
    await Promise.all([
      supabase.from('task_recipe_steps').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('task_recipe_steps').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    if (selectedRecipe) fetchSteps(selectedRecipe.id);
  };

  const toggleStepMaterials = (stepId: string) => {
    if (expandedStepId === stepId) {
      setExpandedStepId(null);
      setStepMaterials([]);
    } else {
      setExpandedStepId(stepId);
      fetchStepMaterials(stepId);
    }
    setNewMatName(''); setNewMatQty(''); setNewMatUnit(''); setNewMatStore(''); setNewMatSku('');
  };

  const handleAddMaterial = async () => {
    if (!expandedStepId || !newMatName.trim()) return;
    const { error } = await supabase.from('task_recipe_step_materials').insert({
      recipe_step_id: expandedStepId,
      material_name: newMatName.trim(),
      qty: newMatQty ? parseFloat(newMatQty) : null,
      unit: newMatUnit.trim() || null,
      store: newMatStore.trim() || null,
      sku: newMatSku.trim() || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewMatName(''); setNewMatQty(''); setNewMatUnit(''); setNewMatStore(''); setNewMatSku('');
    fetchStepMaterials(expandedStepId);
  };

  const handleDeleteMaterial = async (matId: string) => {
    const { error } = await supabase.from('task_recipe_step_materials').delete().eq('id', matId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (expandedStepId) fetchStepMaterials(expandedStepId);
  };

  if (adminLoading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  if (!canAccess) return null;

  // Detail view
  if (selectedRecipe) {
    return (
      <div className="pb-20">
        <PageHeader title={selectedRecipe.name} backTo="/admin" actions={
          <Button size="sm" variant="ghost" onClick={() => { setSelectedRecipe(null); setSteps([]); setExpandedStepId(null); setStepMaterials([]); }}>Back to list</Button>
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
              <Label>Est. Cost</Label>
              <Input type="number" value={editEstCost} onChange={(e) => setEditEstCost(e.target.value)} step="0.01" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Keywords (comma-separated)</Label>
            <Input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} placeholder="bathroom, 5x7 bath, ..." />
          </div>

          {selectedRecipe.last_actual_avg != null && (
            <div className="text-sm text-muted-foreground">
              Actual avg: ${selectedRecipe.last_actual_avg.toFixed(2)} ({selectedRecipe.last_actual_count} projects)
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSaveRecipe} className="flex-1">Save Recipe</Button>
            <Button variant="destructive" size="icon" onClick={handleDeleteRecipe}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <Label>Steps ({steps.length})</Label>
            {steps.map((step, idx) => (
              <div key={step.id} className="space-y-0">
                <Card className="p-2 flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => handleMoveStep(step.id, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▲</button>
                    <button onClick={() => handleMoveStep(step.id, 'down')} disabled={idx === steps.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▼</button>
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleStepMaterials(step.id)}>
                    <p className="text-sm font-medium truncate">{step.title}</p>
                    {step.trade && <p className="text-xs text-muted-foreground">{step.trade}</p>}
                  </div>
                  {step.is_optional && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
                  <button onClick={() => toggleStepMaterials(step.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                    {expandedStepId === step.id ? <ChevronUp className="h-4 w-4" /> : <Package className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => handleDeleteStep(step.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Card>

                {/* Materials for expanded step */}
                {expandedStepId === step.id && (
                  <div className="ml-6 mt-1 mb-2 space-y-1.5 border-l-2 border-muted pl-3">
                    <p className="text-xs font-medium text-muted-foreground">Materials</p>
                    {stepMaterials.map(mat => (
                      <div key={mat.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate">{mat.material_name}</span>
                        {mat.qty != null && <span className="text-muted-foreground">{mat.qty} {mat.unit || ''}</span>}
                        {mat.sku && <Badge variant="outline" className="text-[9px]">{mat.sku}</Badge>}
                        <button onClick={() => handleDeleteMaterial(mat.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <div className="grid grid-cols-5 gap-1">
                      <Input placeholder="Material" value={newMatName} onChange={e => setNewMatName(e.target.value)} className="h-7 text-xs col-span-2" />
                      <Input placeholder="Qty" type="number" value={newMatQty} onChange={e => setNewMatQty(e.target.value)} className="h-7 text-xs" />
                      <Input placeholder="Unit" value={newMatUnit} onChange={e => setNewMatUnit(e.target.value)} className="h-7 text-xs" />
                      <Button size="sm" onClick={handleAddMaterial} disabled={!newMatName.trim()} className="h-7 text-xs">
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Input placeholder="Store" value={newMatStore} onChange={e => setNewMatStore(e.target.value)} className="h-7 text-xs" />
                      <Input placeholder="SKU" value={newMatSku} onChange={e => setNewMatSku(e.target.value)} className="h-7 text-xs" />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex gap-2">
              <Input placeholder="Step title" value={newStepTitle} onChange={(e) => setNewStepTitle(e.target.value)} className="flex-1" />
              <Input placeholder="Trade" value={newStepTrade} onChange={(e) => setNewStepTrade(e.target.value)} className="w-24" />
              <Button size="sm" onClick={handleAddStep} disabled={!newStepTitle.trim()}>
                <Plus className="h-4 w-4" />
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
        title="Recipes"
        backTo="/admin"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />Recipe
          </Button>
        }
      />
      <div className="p-4">
        {recipes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No recipes yet.</p>
        ) : (
          <div className="space-y-2">
            {recipes.map(r => (
              <Card key={r.id} className="p-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => selectRecipe(r)}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{r.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {r.trade && <Badge variant="secondary" className="text-[10px]">{r.trade}</Badge>}
                      {r.estimated_cost != null && (
                        <span className="text-xs text-muted-foreground">${r.estimated_cost.toLocaleString()}</span>
                      )}
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
          <DialogHeader><DialogTitle>New Recipe</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Trade</Label>
                <Input value={newTrade} onChange={(e) => setNewTrade(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Est. Cost</Label>
                <Input type="number" value={newEstCost} onChange={(e) => setNewEstCost(e.target.value)} step="0.01" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Keywords (comma-separated)</Label>
              <Input value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="bathroom, 5x7 bath, ..." />
            </div>
            <Button type="submit" className="w-full">Create Recipe</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRecipes;
