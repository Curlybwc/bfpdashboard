
-- Add new columns to align with task_materials
ALTER TABLE public.task_recipe_step_materials ADD COLUMN vendor_url text;
ALTER TABLE public.task_recipe_step_materials ADD COLUMN provided_by text DEFAULT 'either';
ALTER TABLE public.task_recipe_step_materials ADD COLUMN store_section text;

-- Migrate existing store data to store_section
UPDATE public.task_recipe_step_materials SET store_section = store WHERE store IS NOT NULL;

-- Drop old store column
ALTER TABLE public.task_recipe_step_materials DROP COLUMN store;

-- Index for expansion performance
CREATE INDEX idx_recipe_step_materials_step ON public.task_recipe_step_materials(recipe_step_id);

-- Constrain provided_by values
ALTER TABLE public.task_recipe_step_materials
ADD CONSTRAINT chk_recipe_material_provided_by
CHECK (provided_by IN ('company','contractor','either'));

-- Update expand_recipe RPC with aligned field mapping
CREATE OR REPLACE FUNCTION public.expand_recipe(p_parent_task_id uuid, p_recipe_id uuid, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent RECORD;
  v_step RECORD;
  v_mat RECORD;
  v_count integer := 0;
  v_new_task_id uuid;
BEGIN
  SELECT id, project_id, trade, priority, room_area, expanded_recipe_id
  INTO v_parent
  FROM public.tasks
  WHERE id = p_parent_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent task not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE parent_task_id = p_parent_task_id) THEN
    RAISE EXCEPTION 'Task already has children';
  END IF;

  IF v_parent.expanded_recipe_id IS NOT NULL THEN
    RAISE EXCEPTION 'Task already expanded from a recipe';
  END IF;

  FOR v_step IN
    SELECT id, title, sort_order, trade, notes
    FROM public.task_recipe_steps
    WHERE recipe_id = p_recipe_id
    ORDER BY sort_order
  LOOP
    INSERT INTO public.tasks (
      project_id, parent_task_id, task, sort_order,
      source_recipe_id, source_recipe_step_id,
      trade, priority, room_area, stage, materials_on_site, created_by
    ) VALUES (
      v_parent.project_id, p_parent_task_id, v_step.title, v_step.sort_order * 10,
      p_recipe_id, v_step.id,
      COALESCE(v_step.trade, v_parent.trade), v_parent.priority,
      v_parent.room_area, 'Not Ready', 'No', p_user_id
    )
    RETURNING id INTO v_new_task_id;

    -- Insert materials with 1:1 field mapping
    FOR v_mat IN
      SELECT material_name, qty, unit, sku, vendor_url, store_section, provided_by
      FROM public.task_recipe_step_materials
      WHERE recipe_step_id = v_step.id
    LOOP
      INSERT INTO public.task_materials (
        task_id, name, quantity, unit, sku, vendor_url, store_section, provided_by, item_type
      ) VALUES (
        v_new_task_id, v_mat.material_name, v_mat.qty, v_mat.unit,
        v_mat.sku, v_mat.vendor_url, v_mat.store_section,
        COALESCE(v_mat.provided_by, 'either'), 'material'
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.tasks
  SET expanded_recipe_id = p_recipe_id
  WHERE id = p_parent_task_id;

  RETURN v_count;
END;
$function$;
