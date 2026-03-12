import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, ChevronUp, Package, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import StepMaterialsEditor from './StepMaterialsEditor';

interface RecipeStep {
  id: string;
  title: string;
  sort_order: number;
  trade: string | null;
  is_optional: boolean;
}

interface RecipeStepRowProps {
  step: RecipeStep;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
}

const RecipeStepRow = ({
  step, isExpanded, onToggleExpand, onDelete,
}: RecipeStepRowProps) => {
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
        {step.is_optional && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
        <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground shrink-0">
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
