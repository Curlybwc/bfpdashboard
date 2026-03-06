import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RecipeMetaEditorProps {
  name: string;
  onNameChange: (v: string) => void;
  trade: string;
  onTradeChange: (v: string) => void;
  keywords: string;
  onKeywordsChange: (v: string) => void;
  estimatedCost: string;
  onEstimatedCostChange: (v: string) => void;
  lastActualAvg?: number | null;
  lastActualCount?: number;
}

const RecipeMetaEditor = ({
  name, onNameChange,
  trade, onTradeChange,
  keywords, onKeywordsChange,
  estimatedCost, onEstimatedCostChange,
  lastActualAvg, lastActualCount,
}: RecipeMetaEditorProps) => {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={name} onChange={(e) => onNameChange(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Trade</Label>
          <Input value={trade} onChange={(e) => onTradeChange(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Est. Cost</Label>
          <Input type="number" value={estimatedCost} onChange={(e) => onEstimatedCostChange(e.target.value)} step="0.01" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Keywords (comma-separated)</Label>
        <Input value={keywords} onChange={(e) => onKeywordsChange(e.target.value)} placeholder="bathroom, 5x7 bath, ..." />
      </div>
      {lastActualAvg != null && (
        <div className="text-sm text-muted-foreground">
          Actual avg: ${lastActualAvg.toFixed(2)} ({lastActualCount ?? 0} projects)
        </div>
      )}
    </div>
  );
};

export default RecipeMetaEditor;
