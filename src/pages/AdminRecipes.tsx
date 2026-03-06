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
import { Plus, ChevronRight } from 'lucide-react';
import RecipeBuilderSheet from '@/components/recipe/RecipeBuilderSheet';

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

const AdminRecipes = () => {
  const { isAdmin, canManageProjects, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState('');
  const [newTrade, setNewTrade] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newEstCost, setNewEstCost] = useState('');

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
  };

  if (adminLoading) return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
  if (!canAccess) return null;

  // Detail view using RecipeBuilderSheet
  if (selectedRecipe) {
    return (
      <div className="pb-20">
        <PageHeader title={selectedRecipe.name} backTo="/admin" actions={
          <Button size="sm" variant="ghost" onClick={() => setSelectedRecipe(null)}>Back to list</Button>
        } />
        <div className="p-4">
          <RecipeBuilderSheet
            recipeId={selectedRecipe.id}
            initialName={selectedRecipe.name}
            initialTrade={selectedRecipe.trade || ''}
            initialKeywords={selectedRecipe.keywords.join(', ')}
            initialEstimatedCost={selectedRecipe.estimated_cost?.toString() || ''}
            lastActualAvg={selectedRecipe.last_actual_avg}
            lastActualCount={selectedRecipe.last_actual_count}
            onSaved={() => fetchRecipes()}
            onDeleted={() => { setSelectedRecipe(null); fetchRecipes(); }}
          />
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
