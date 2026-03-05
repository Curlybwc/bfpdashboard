
-- Add qty_formula column
ALTER TABLE public.task_recipe_step_materials ADD COLUMN qty_formula text;

-- Update expand_recipe RPC with deterministic formula parsing
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
  v_room_sqft numeric;
  v_perimeter_ft numeric;
  v_task_qty numeric;
  v_computed_qty numeric;
  v_num_part text;
  v_parsed_num numeric;
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

  -- Compute variables from parent task
  BEGIN
    v_room_sqft := NULLIF(v_parent.room_area, '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_room_sqft := NULL;
  END;
  
  IF v_room_sqft IS NOT NULL AND v_room_sqft > 0 THEN
    v_perimeter_ft := round(sqrt(v_room_sqft) * 4, 2);
  ELSE
    v_perimeter_ft := NULL;
  END IF;
  
  v_task_qty := COALESCE(v_room_sqft, 1);

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

    -- Insert materials with formula support
    FOR v_mat IN
      SELECT material_name, qty, unit, sku, vendor_url, store_section, provided_by, qty_formula
      FROM public.task_recipe_step_materials
      WHERE recipe_step_id = v_step.id
    LOOP
      v_computed_qty := v_mat.qty; -- default

      IF v_mat.qty_formula IS NOT NULL AND trim(v_mat.qty_formula) <> '' THEN
        DECLARE
          v_formula text := trim(v_mat.qty_formula);
        BEGIN
          -- Exact matches
          IF v_formula = 'room_sqft' AND v_room_sqft IS NOT NULL THEN
            v_computed_qty := v_room_sqft;
          ELSIF v_formula = 'perimeter_ft' AND v_perimeter_ft IS NOT NULL THEN
            v_computed_qty := v_perimeter_ft;
          ELSIF v_formula = 'task_qty' THEN
            v_computed_qty := v_task_qty;
          -- room_sqft * number
          ELSIF v_formula LIKE 'room_sqft * %' AND v_room_sqft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'room_sqft \* (.+)'));
            v_parsed_num := v_num_part::numeric;
            v_computed_qty := v_room_sqft * v_parsed_num;
          -- room_sqft / number
          ELSIF v_formula LIKE 'room_sqft / %' AND v_room_sqft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'room_sqft / (.+)'));
            v_parsed_num := v_num_part::numeric;
            IF v_parsed_num <> 0 THEN
              v_computed_qty := v_room_sqft / v_parsed_num;
            END IF;
          -- perimeter_ft * number
          ELSIF v_formula LIKE 'perimeter_ft * %' AND v_perimeter_ft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'perimeter_ft \* (.+)'));
            v_parsed_num := v_num_part::numeric;
            v_computed_qty := v_perimeter_ft * v_parsed_num;
          -- perimeter_ft / number
          ELSIF v_formula LIKE 'perimeter_ft / %' AND v_perimeter_ft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'perimeter_ft / (.+)'));
            v_parsed_num := v_num_part::numeric;
            IF v_parsed_num <> 0 THEN
              v_computed_qty := v_perimeter_ft / v_parsed_num;
            END IF;
          -- task_qty * number
          ELSIF v_formula LIKE 'task_qty * %' THEN
            v_num_part := trim(substring(v_formula from 'task_qty \* (.+)'));
            v_parsed_num := v_num_part::numeric;
            v_computed_qty := v_task_qty * v_parsed_num;
          -- task_qty / number
          ELSIF v_formula LIKE 'task_qty / %' THEN
            v_num_part := trim(substring(v_formula from 'task_qty / (.+)'));
            v_parsed_num := v_num_part::numeric;
            IF v_parsed_num <> 0 THEN
              v_computed_qty := v_task_qty / v_parsed_num;
            END IF;
          END IF;
          -- If pattern didn't match, v_computed_qty stays as v_mat.qty
        EXCEPTION WHEN OTHERS THEN
          v_computed_qty := v_mat.qty; -- fallback on parse error
        END;
      END IF;

      -- Round to 2 decimal places
      IF v_computed_qty IS NOT NULL THEN
        v_computed_qty := round(v_computed_qty, 2);
      END IF;

      INSERT INTO public.task_materials (
        task_id, name, quantity, unit, sku, vendor_url, store_section, provided_by, item_type
      ) VALUES (
        v_new_task_id, v_mat.material_name, v_computed_qty, v_mat.unit,
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
