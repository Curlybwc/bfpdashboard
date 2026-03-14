import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, ChevronUp, ChevronDown, GripVertical, Pencil, Check, Users, Package } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import StepMaterialsEditor from './StepMaterialsEditor';
import SyncToLibraryDialog from '@/components/SyncToLibraryDialog';
import VariantBadge from './VariantBadge';
import type { RecipeVariant } from './VariantManager';

interface RecipeStep {
  id: string;
  title: string;
  sort_order: number;
  trade: string | null;
  is_optional: boolean;
  assignment_mode?: string;
  default_candidate_user_ids?: string[];
  variant_id?: string | null;
}

interface ProfileOption {
  id: string;
  full_name: string | null;
}

interface RecipeStepRowProps {
  step: RecipeStep;
  recipeId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onUpdated: () => void;
  allProfiles: ProfileOption[];
  profileNameMap: Record<string, string>;
  profilesLoading: boolean;
}

const RecipeStepRow = ({
  step,
  recipeId,
  isExpanded,
  onToggleExpand,
  onDelete,
  onUpdated,
  allProfiles,
  profileNameMap,
  profilesLoading,
}: RecipeStepRowProps) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(step.title);
  const [editTrade, setEditTrade] = useState(step.trade || '');
  const [editOptional, setEditOptional] = useState(step.is_optional);
  const [editCrewMode, setEditCrewMode] = useState(step.assignment_mode === 'crew');
  const [editCandidates, setEditCandidates] = useState<string[]>(step.default_candidate_user_ids || []);
  const [materialCount, setMaterialCount] = useState(0);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushPromptLoading, setPushPromptLoading] = useState(false);

  useEffect(() => {
    supabase
      .from('task_recipe_step_materials')
      .select('id', { count: 'exact', head: true })
      .eq('recipe_step_id', step.id)
      .then(({ count }) => setMaterialCount(count ?? 0));
  }, [step.id, isExpanded]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(step.title);
    setEditTrade(step.trade || '');
    setEditOptional(step.is_optional);
    setEditCrewMode(step.assignment_mode === 'crew');
    setEditCandidates(step.default_candidate_user_ids || []);
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editTitle.trim()) return;
    const { error } = await supabase.from('task_recipe_steps').update({
      title: editTitle.trim(),
      trade: editTrade.trim() || null,
      is_optional: editOptional,
      assignment_mode: editCrewMode ? 'crew' : 'solo',
      default_candidate_user_ids: editCrewMode ? editCandidates : [],
    }).eq('id', step.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setIsEditing(false);
    onUpdated();
    setPushPromptOpen(true);
  };

  const handlePushStepOnly = async () => {
    setPushPromptLoading(true);
    const { data, error } = await supabase.rpc('push_recipe_step_to_tasks' as any, { p_step_id: step.id });
    setPushPromptLoading(false);
    if (error) {
      toast({ title: 'Error pushing step', description: error.message, variant: 'destructive' });
    } else {
      const result = data as any;
      toast({ title: `Step pushed to ${result?.tasks_updated ?? 0} active tasks`, description: `${result?.materials_synced ?? 0} material entries synced` });
    }
    setPushPromptOpen(false);
  };

  const sortedProfiles = allProfiles
    .slice()
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const isCrew = step.assignment_mode === 'crew';
  const candidateIds = step.default_candidate_user_ids || [];
  const candidateCount = candidateIds.length;
  const candidateNames = candidateIds.map((id) => profileNameMap[id] || `User ${id.slice(0, 8)}`);
  const selectedEditNames = editCandidates.map((id) => profileNameMap[id] || `User ${id.slice(0, 8)}`);

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="space-y-0">
        <Card className="p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Step title"
              className="h-8 text-sm flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit(e as any);
                if (e.key === 'Escape') setIsEditing(false);
              }}
            />
            <button onClick={handleSaveEdit} className="text-primary hover:text-primary/80 shrink-0 p-1">
              <Check className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={editTrade}
              onChange={(e) => setEditTrade(e.target.value)}
              placeholder="Trade"
              className="h-7 text-xs flex-1"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <Switch
                id={`optional-${step.id}`}
                checked={editOptional}
                onCheckedChange={setEditOptional}
                className="scale-75"
              />
              <Label htmlFor={`optional-${step.id}`} className="text-xs text-muted-foreground">Optional</Label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Switch
                id={`crew-${step.id}`}
                checked={editCrewMode}
                onCheckedChange={setEditCrewMode}
                className="scale-75"
              />
              <Label htmlFor={`crew-${step.id}`} className="text-xs text-muted-foreground">Crew Task</Label>
            </div>
          </div>
          {editCrewMode && (
            <div className="border rounded p-2 bg-background space-y-1.5">
              <p className="text-xs font-medium">Default crew members</p>
              {selectedEditNames.length > 0 && (
                <p className="text-[11px] text-muted-foreground truncate">{selectedEditNames.join(', ')}</p>
              )}
              {profilesLoading ? (
                <p className="text-xs text-muted-foreground">Loading workers…</p>
              ) : sortedProfiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No workers available in your visible roster.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {sortedProfiles.map((profile) => {
                    const isChecked = editCandidates.includes(profile.id);
                    return (
                      <label key={profile.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            setEditCandidates((prev) =>
                              checked ? [...prev, profile.id] : prev.filter((id) => id !== profile.id)
                            );
                          }}
                        />
                        <span>{profile.full_name || 'Unnamed'}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Selected: {editCandidates.length}</p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={cn('space-y-0', isDragging && 'opacity-50 z-50')}>
      <Card className="p-2 flex items-center gap-2">
        <button
          className="shrink-0 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-none"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <p className="text-sm font-medium truncate">{step.title}</p>
          {step.trade && <p className="text-xs text-muted-foreground">{step.trade}</p>}
          {isCrew && (
            <p className="text-[11px] text-muted-foreground truncate">
              Crew: {candidateNames.length > 0 ? candidateNames.join(', ') : 'No default members selected'}
            </p>
          )}
        </div>
        {isCrew && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Users className="h-3 w-3" />
            {candidateCount > 0 ? `${candidateCount}` : 'Crew'}
          </Badge>
        )}
        {step.is_optional && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
        <button onClick={onToggleExpand} className={cn(
          "shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors",
          isExpanded ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )} title="Materials & Tools">
          <Package className="h-3.5 w-3.5" />
          {materialCount > 0 && <span className="font-medium">{materialCount}</span>}
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <button onClick={handleStartEdit} className="text-muted-foreground hover:text-foreground shrink-0 p-1">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive shrink-0 p-1">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Card>
      {isExpanded && <StepMaterialsEditor stepId={step.id} />}
      <SyncToLibraryDialog
        open={pushPromptOpen}
        onOpenChange={setPushPromptOpen}
        title="Push this step to active tasks?"
        description={`"${step.title}" was updated. Push this step's changes (title, trade, crew, materials) to all matching active subtasks?`}
        confirmLabel="Yes, push this step"
        cancelLabel="No, recipe only"
        loading={pushPromptLoading}
        onConfirm={handlePushStepOnly}
      />
    </div>
  );
};

export default RecipeStepRow;
