import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RecipeVariant } from './VariantManager';

interface VariantBadgeProps {
  currentVariantId: string | null;
  variants: RecipeVariant[];
  onChange: (variantId: string | null) => void;
  disabled?: boolean;
}

const VariantBadge = ({ currentVariantId, variants, onChange, disabled = false }: VariantBadgeProps) => {
  if (variants.length === 0) return null;

  return (
    <Select
      value={currentVariantId ?? '__shared__'}
      onValueChange={(v) => onChange(v === '__shared__' ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-6 w-auto min-w-[80px] max-w-[140px] text-[11px] px-2 py-0 border-dashed gap-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__shared__">Shared</SelectItem>
        {variants.map(v => (
          <SelectItem key={v.id} value={v.id}>
            {v.name}{v.is_default ? ' ★' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default VariantBadge;
