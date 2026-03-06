import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, ChevronUp, Package } from 'lucide-react';
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
  index: number;
  totalSteps: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

const RecipeStepRow = ({
  step, index, totalSteps, isExpanded,
  onToggleExpand, onMoveUp, onMoveDown, onDelete,
}: RecipeStepRowProps) => {
  return (
    <div className="space-y-0">
      <Card className="p-2 flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▲</button>
          <button onClick={onMoveDown} disabled={index === totalSteps - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">▼</button>
        </div>
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
