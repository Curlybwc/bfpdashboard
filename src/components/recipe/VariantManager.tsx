import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Check, X, GitBranch } from 'lucide-react';

export interface RecipeVariant {
  id: string;
  recipe_id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
}

interface VariantManagerProps {
  recipeId: string;
  variants: RecipeVariant[];
  onChanged: () => void;
  readOnly?: boolean;
}

// recipe_variants table is new and may not be in auto-generated types yet
const variantsTable = () => (supabase.from as any)('recipe_variants');

const VariantManager = ({ recipeId, variants, onChanged, readOnly = false }: VariantManagerProps) => {
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const maxOrder = variants.length > 0 ? Math.max(...variants.map(v => v.sort_order)) : 0;
    const { error } = await variantsTable().insert({
      recipe_id: recipeId,
      name: newName.trim(),
      sort_order: maxOrder + 10,
    });
    setAdding(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setNewName('');
    onChanged();
  };

  const handleDelete = async (id: string) => {
    const { error } = await variantsTable().delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();
  };

  const handleSetDefault = async (id: string) => {
    const { error } = await variantsTable().update({ is_default: true }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    onChanged();
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await variantsTable().update({ name: editName.trim() }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingId(null);
    onChanged();
  };

  if (variants.length === 0 && readOnly) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Variants ({variants.length})</Label>
      </div>
      {variants.length === 0 && !readOnly && (
        <p className="text-xs text-muted-foreground">No variants — all steps are shared. Add a variant to create alternate execution paths.</p>
      )}
      {variants.length > 0 && (
        <div className="space-y-1">
          {variants.map(v => (
            <div key={v.id} className="flex items-center gap-2 text-sm border rounded px-2 py-1.5">
              {editingId === v.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="h-7 text-sm flex-1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(v.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <button onClick={() => handleRename(v.id)} className="text-primary hover:text-primary/80 p-0.5">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground p-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">{v.name}</span>
                  {v.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  {!readOnly && (
                    <>
                      {!v.is_default && (
                        <button
                          onClick={() => handleSetDefault(v.id)}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          Set default
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingId(v.id); setEditName(v.name); }}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="text-muted-foreground hover:text-destructive p-0.5"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            placeholder="New variant name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="h-8 text-sm flex-1"
            onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) handleAdd(); }}
          />
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || adding}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default VariantManager;
