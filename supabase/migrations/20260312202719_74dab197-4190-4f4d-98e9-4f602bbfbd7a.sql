
CREATE OR REPLACE FUNCTION public.expand_recipe(p_parent_task_id uuid, p_recipe_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_step RECORD;
  v_mat RECORD;
  v_count integer := 0;
  v_new_task_id uuid;
  v_first_task_id uuid;
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
      v_parent.room_area, 'Ready', 'No', p_user_id
    )
    RETURNING id INTO v_new_task_id;

    IF v_first_task_id IS NULL THEN
      v_first_task_id := v_new_task_id;
    END IF;

    FOR v_mat IN
      SELECT material_name, qty, unit, sku, vendor_url, store_section, provided_by, qty_formula, item_type, unit_cost
      FROM public.task_recipe_step_materials
      WHERE recipe_step_id = v_step.id
    LOOP
      v_computed_qty := v_mat.qty;

      IF v_mat.qty_formula IS NOT NULL AND trim(v_mat.qty_formula) <> '' THEN
        DECLARE
          v_formula text := trim(v_mat.qty_formula);
        BEGIN
          IF v_formula = 'room_sqft' AND v_room_sqft IS NOT NULL THEN
            v_computed_qty := v_room_sqft;
          ELSIF v_formula = 'perimeter_ft' AND v_perimeter_ft IS NOT NULL THEN
            v_computed_qty := v_perimeter_ft;
          ELSIF v_formula = 'task_qty' THEN
            v_computed_qty := v_task_qty;
          ELSIF v_formula LIKE 'room_sqft * %' AND v_room_sqft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'room_sqft \* (.+)'));
            v_parsed_num := v_num_part::numeric;
            v_computed_qty := v_room_sqft * v_parsed_num;
          ELSIF v_formula LIKE 'room_sqft / %' AND v_room_sqft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'room_sqft / (.+)'));
            v_parsed_num := v_num_part::numeric;
            IF v_parsed_num <> 0 THEN
              v_computed_qty := v_room_sqft / v_parsed_num;
            END IF;
          ELSIF v_formula LIKE 'perimeter_ft * %' AND v_perimeter_ft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'perimeter_ft \* (.+)'));
            v_parsed_num := v_num_part::numeric;
            v_computed_qty := v_perimeter_ft * v_parsed_num;
          ELSIF v_formula LIKE 'perimeter_ft / %' AND v_perimeter_ft IS NOT NULL THEN
            v_num_part := trim(substring(v_formula from 'perimeter_ft / (.+)'));
            v_parsed_num := v_num_part::numeric;
            IF v_parsed_num <> 0 THEN
              v_computed_qty := v_perimeter_ft / v_parsed_num;
            END IF;
          ELSIF v_formula LIKE 'task_qty * %' THEN
            v_num_part := trim(substring(v_formula from 'task_qty \* (.+)'));
            v_parsed_num := v_num_part::numeric;
            v_computed_qty := v_task_qty * v_parsed_num;
          ELSIF v_formula LIKE 'task_qty / %' THEN
            v_num_part := trim(substring(v_formula from 'task_qty / (.+)'));
            v_parsed_num := v_num_part::numeric;
            IF v_parsed_num <> 0 THEN
              v_computed_qty := v_task_qty / v_parsed_num;
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_computed_qty := v_mat.qty;
        END;
      END IF;

      INSERT INTO public.task_materials (
        task_id, name, quantity, unit, sku, vendor_url,
        store_section, provided_by, item_type, unit_cost
      ) VALUES (
        v_new_task_id, v_mat.material_name, v_computed_qty, v_mat.unit,
        v_mat.sku, v_mat.vendor_url, v_mat.store_section,
        COALESCE(v_mat.provided_by, 'either'), COALESCE(v_mat.item_type, 'material'),
        v_mat.unit_cost
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.tasks
  SET expanded_recipe_id = p_recipe_id, is_package = true
  WHERE id = p_parent_task_id;

  PERFORM public.apply_assignment_rules(v_first_task_id);

  RETURN v_count;
END;
$$;
