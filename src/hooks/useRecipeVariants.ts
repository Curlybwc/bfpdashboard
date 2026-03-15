import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RecipeVariant } from '@/components/recipe/VariantManager';

// recipe_variants table is new and may not be in auto-generated types yet
const variantsTable = () => (supabase.from as any)('recipe_variants');

export function useRecipeVariants(recipeId: string | null | undefined) {
  const [variants, setVariants] = useState<RecipeVariant[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVariants = useCallback(async () => {
    if (!recipeId) { setVariants([]); return; }
    setLoading(true);
    const { data } = await variantsTable()
      .select('*')
      .eq('recipe_id', recipeId)
      .order('sort_order');
    setVariants((data as RecipeVariant[]) || []);
    setLoading(false);
  }, [recipeId]);

  useEffect(() => {
    fetchVariants();
  }, [fetchVariants]);

  const defaultVariant = variants.find(v => v.is_default) || null;

  return { variants, loading, fetchVariants, defaultVariant };
}
