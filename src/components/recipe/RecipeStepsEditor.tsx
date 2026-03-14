import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus } from 'lucide-react';
import type { RecipeVariant } from './VariantManager';
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
} from '@dnd-kit/sortable';
import RecipeStepRow from './RecipeStepRow';

interface RecipeStep {
  id: string;
  recipe_id: string;
  title: string;
  sort_order: number;
  trade: string | null;
  notes: string | null;
  is_optional: boolean;
  assignment_mode: string;
  default_candidate_user_ids: string[];
}

interface ProfileOption {
  id: string;
  full_name: string | null;
}

interface RecipeStepsEditorProps {
  recipeId: string;
  onStepsChanged?: () => void;
  variants?: RecipeVariant[];
}

const RecipeStepsEditor = ({ recipeId, onStepsChanged, variants = [] }: RecipeStepsEditorProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepTrade, setNewStepTrade] = useState('');
  const [allProfiles, setAllProfiles] = useState<ProfileOption[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const fetchSteps = useCallback(async () => {
    const { data } = await supabase
      .from('task_recipe_steps')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('sort_order');
    if (data) setSteps(data as RecipeStep[]);
  }, [recipeId]);

  const fetchVisibleProfiles = useCallback(async () => {
    setProfilesLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name');

    setProfilesLoading(false);

    if (error) {
      toast({ title: 'Error loading workers', description: error.message, variant: 'destructive' });
      return;
    }

    setAllProfiles((data as ProfileOption[]) || []);
  }, [toast]);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  useEffect(() => {
    fetchVisibleProfiles();
  }, [fetchVisibleProfiles]);

  useEffect(() => {
    const candidateIds = Array.from(new Set(steps.flatMap((step) => step.default_candidate_user_ids || [])));
    const existingIds = new Set(allProfiles.map((profile) => profile.id));
    const missingIds = candidateIds.filter((id) => !existingIds.has(id));

    if (missingIds.length === 0) return;

    supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', missingIds)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setAllProfiles((prev) => {
          const seen = new Set(prev.map((profile) => profile.id));
          const merged = [...prev];
          (data as ProfileOption[]).forEach((profile) => {
            if (!seen.has(profile.id)) {
              merged.push(profile);
              seen.add(profile.id);
            }
          });
          return merged;
        });
      });
  }, [steps, allProfiles]);

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
    onStepsChanged?.();
  };

  const handleDeleteStep = async (stepId: string) => {
    const { error } = await supabase.from('task_recipe_steps').delete().eq('id', stepId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (expandedStepId === stepId) setExpandedStepId(null);
    fetchSteps();
    onStepsChanged?.();
  };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex(s => s.id === active.id);
    const newIndex = steps.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...steps];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setSteps(reordered);

    const updates = reordered.map((s, i) =>
      supabase.from('task_recipe_steps').update({ sort_order: (i + 1) * 10 }).eq('id', s.id)
    );
    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error);
    if (firstError?.error) {
      toast({ title: 'Error', description: firstError.error.message, variant: 'destructive' });
      fetchSteps();
    }
  }, [steps, toast, fetchSteps]);

  const toggleExpand = (stepId: string) => {
    setExpandedStepId(prev => prev === stepId ? null : stepId);
  };

  const profileNameMap = allProfiles.reduce<Record<string, string>>((acc, profile) => {
    acc[profile.id] = profile.full_name || 'Unnamed';
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      <Label>Steps ({steps.length})</Label>
      <p className="text-xs text-muted-foreground">Crew assignments are visible on crew steps and editable with the pencil icon.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
           {steps.map((step) => (
              <RecipeStepRow
                key={step.id}
                step={step}
                recipeId={recipeId}
                isExpanded={expandedStepId === step.id}
                onToggleExpand={() => toggleExpand(step.id)}
                onDelete={() => handleDeleteStep(step.id)}
                onUpdated={() => fetchSteps()}
                allProfiles={allProfiles}
                profileNameMap={profileNameMap}
                profilesLoading={profilesLoading}
                variants={variants}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
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
