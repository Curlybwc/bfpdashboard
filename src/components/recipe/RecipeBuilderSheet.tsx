import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import RecipeMetaEditor from './RecipeMetaEditor';
import RecipeStepsEditor from './RecipeStepsEditor';

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

  const [name, setName] = useState(initialName);
  const [trade, setTrade] = useState(initialTrade);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [estimatedCost, setEstimatedCost] = useState(initialEstimatedCost);

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
    </div>
  );
};

export default RecipeBuilderSheet;
