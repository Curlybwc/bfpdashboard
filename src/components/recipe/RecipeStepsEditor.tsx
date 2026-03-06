import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus } from 'lucide-react';
import RecipeStepRow from './RecipeStepRow';

interface RecipeStep {
  id: string;
  recipe_id: string;
  title: string;
  sort_order: number;
  trade: string | null;
  notes: string | null;
  is_optional: boolean;
}

interface RecipeStepsEditorProps {
  recipeId: string;
  onStepsChanged?: () => void;
}

const RecipeStepsEditor = ({ recipeId, onStepsChanged }: RecipeStepsEditorProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepTrade, setNewStepTrade] = useState('');

  const fetchSteps = async () => {
    const { data } = await supabase
      .from('task_recipe_steps')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('sort_order');
    if (data) setSteps(data as RecipeStep[]);
  };

  useEffect(() => {
    fetchSteps();
  }, [recipeId]);

  const handleAddStep = async () => {
    if (!newStepTitle.trim()) return;
    const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.sort_order)) : 0;
    const { error } = await supabase.from('task_recipe_steps').insert({
      recipe_id: recipeId,
      title: newStepTitle.trim(),
      sort_order: maxOrder + 10,
      trade: newStepTrade.trim() || null,
      created_by: user?.id,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewStepTitle('');
    setNewStepTrade('');
    fetchSteps();
  };

  const handleDeleteStep = async (stepId: string) => {
    const { error } = await supabase.from('task_recipe_steps').delete().eq('id', stepId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (expandedStepId === stepId) setExpandedStepId(null);
    fetchSteps();
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
    fetchSteps();
  };

  const toggleExpand = (stepId: string) => {
    setExpandedStepId(prev => prev === stepId ? null : stepId);
  };

  return (
    <div className="space-y-2">
      <Label>Steps ({steps.length})</Label>
      {steps.map((step, idx) => (
        <RecipeStepRow
          key={step.id}
          step={step}
          index={idx}
          totalSteps={steps.length}
          isExpanded={expandedStepId === step.id}
          onToggleExpand={() => toggleExpand(step.id)}
          onMoveUp={() => handleMoveStep(step.id, 'up')}
          onMoveDown={() => handleMoveStep(step.id, 'down')}
          onDelete={() => handleDeleteStep(step.id)}
        />
      ))}
      <div className="flex gap-2">
        <Input placeholder="Step title" value={newStepTitle} onChange={(e) => setNewStepTitle(e.target.value)} className="flex-1" />
        <Input placeholder="Trade" value={newStepTrade} onChange={(e) => setNewStepTrade(e.target.value)} className="w-24" />
        <Button size="sm" onClick={handleAddStep} disabled={!newStepTitle.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default RecipeStepsEditor;
