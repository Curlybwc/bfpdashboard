import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, ChevronUp, Package, GripVertical, Pencil, Check, Users } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import StepMaterialsEditor from './StepMaterialsEditor';

interface RecipeStep {
  id: string;
  title: string;
  sort_order: number;
  trade: string | null;
  is_optional: boolean;
  assignment_mode?: string;
  default_candidate_user_ids?: string[];
}

interface RecipeStepRowProps {
  step: RecipeStep;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onUpdated: () => void;
}

const RecipeStepRow = ({
  step, isExpanded, onToggleExpand, onDelete, onUpdated,
}: RecipeStepRowProps) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(step.title);
  const [editTrade, setEditTrade] = useState(step.trade || '');
  const [editOptional, setEditOptional] = useState(step.is_optional);
  const [editCrewMode, setEditCrewMode] = useState(step.assignment_mode === 'crew');
  const [editCandidates, setEditCandidates] = useState<string[]>(step.default_candidate_user_ids || []);
  const [allProfiles, setAllProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  useEffect(() => {
    if (isEditing && editCrewMode && allProfiles.length === 0) {
      supabase.from('profiles').select('id, full_name').then(({ data }) => {
        setAllProfiles(data || []);
      });
    }
  }, [isEditing, editCrewMode]);

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
  };

  const candidateCount = step.default_candidate_user_ids?.length || 0;
  const isCrew = step.assignment_mode === 'crew';

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
            <div className="border rounded p-2 bg-background space-y-1">
              <p className="text-xs font-medium">Default crew members</p>
              {allProfiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">Loading profiles…</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {allProfiles
                    .slice()
                    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                    .map((p) => {
                      const isChecked = editCandidates.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setEditCandidates(prev =>
                                checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                              );
                            }}
                          />
                          <span>{p.full_name || 'Unnamed'}</span>
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
        </div>
        {isCrew && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Users className="h-3 w-3" />
            {candidateCount > 0 ? `${candidateCount}` : 'Crew'}
          </Badge>
        )}
        {step.is_optional && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
        <button onClick={handleStartEdit} className="text-muted-foreground hover:text-foreground shrink-0">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground shrink-0" title="Materials & Tools">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Package className="h-3.5 w-3.5" />}
        </button>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </Card>
      {isExpanded && <StepMaterialsEditor stepId={step.id} />}
    </div>
  );
};

export default RecipeStepRow;
