
-- Fix: reassign default variant on DELETE using subquery (ORDER BY/LIMIT not allowed in UPDATE directly in plpgsql)
CREATE OR REPLACE FUNCTION public.reassign_default_variant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_next_id uuid;
BEGIN
  IF OLD.is_default THEN
    SELECT id INTO v_next_id
    FROM recipe_variants
    WHERE recipe_id = OLD.recipe_id AND id != OLD.id
    ORDER BY sort_order, created_at
    LIMIT 1;

    IF v_next_id IS NOT NULL THEN
      UPDATE recipe_variants SET is_default = true WHERE id = v_next_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
