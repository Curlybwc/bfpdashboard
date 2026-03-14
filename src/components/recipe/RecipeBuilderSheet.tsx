import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw } from 'lucide-react';
import RecipeMetaEditor from './RecipeMetaEditor';
import RecipeStepsEditor from './RecipeStepsEditor';
import SyncToLibraryDialog from '@/components/SyncToLibraryDialog';
import VariantManager from './VariantManager';
import { useRecipeVariants } from '@/hooks/useRecipeVariants';

interface RecipeBuilderSheetProps {
  recipeId: string;
  initialName: string;
  initialTrade: string;
  initialKeywords: string;
  initialEstimatedCost: string;
  lastActualAvg?: number | null;
  lastActualCount?: number;
  onSaved: () => void;
  onDeleted: () => void;
}

const RecipeBuilderSheet = ({
  recipeId,
  initialName, initialTrade, initialKeywords, initialEstimatedCost,
  lastActualAvg, lastActualCount,
  onSaved, onDeleted,
}: RecipeBuilderSheetProps) => {
  const { toast } = useToast();
  const [pushing, setPushing] = useState(false);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushPromptLoading, setPushPromptLoading] = useState(false);

  const [name, setName] = useState(initialName);
  const [trade, setTrade] = useState(initialTrade);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [estimatedCost, setEstimatedCost] = useState(initialEstimatedCost);

  const { variants, fetchVariants } = useRecipeVariants(recipeId);

  const handleSave = async () => {
    const kwArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
    const { error } = await supabase.from('task_recipes').update({
      name: name.trim(),
      trade: trade.trim() || null,
      keywords: kwArray,
      estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
    }).eq('id', recipeId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recipe updated' });
    onSaved();
    // Prompt to push to active tasks
    setPushPromptOpen(true);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('task_recipes').delete().eq('id', recipeId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recipe deleted' });
    onDeleted();
  };

  const handlePushToTasks = async () => {
    setPushPromptLoading(true);
    const { data, error } = await supabase.rpc('push_recipe_to_tasks', { p_recipe_id: recipeId });
    setPushPromptLoading(false);
    if (error) {
      toast({ title: 'Error pushing to tasks', description: error.message, variant: 'destructive' });
    } else {
      const result = data as any;
      toast({ title: `Pushed to ${result?.tasks_updated ?? 0} active tasks`, description: `${result?.materials_synced ?? 0} material entries synced` });
    }
    setPushPromptOpen(false);
  };

  return (
    <div className="space-y-4">
      <RecipeMetaEditor
        name={name} onNameChange={setName}
        trade={trade} onTradeChange={setTrade}
        keywords={keywords} onKeywordsChange={setKeywords}
        estimatedCost={estimatedCost} onEstimatedCostChange={setEstimatedCost}
        lastActualAvg={lastActualAvg}
        lastActualCount={lastActualCount}
      />

      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1">Save Recipe</Button>
        <Button variant="destructive" size="icon" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <RecipeStepsEditor recipeId={recipeId} />

      <SyncToLibraryDialog
        open={pushPromptOpen}
        onOpenChange={setPushPromptOpen}
        title="Push to active tasks?"
        description="This recipe was updated. Would you like to push these changes to all active tasks that were expanded from it?"
        confirmLabel="Yes, push to tasks"
        cancelLabel="No, recipe only"
        loading={pushPromptLoading}
        onConfirm={handlePushToTasks}
      />
    </div>
  );
};

export default RecipeBuilderSheet;
