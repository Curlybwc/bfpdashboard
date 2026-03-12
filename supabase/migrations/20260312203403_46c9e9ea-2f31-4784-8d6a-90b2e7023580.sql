
CREATE OR REPLACE FUNCTION public.capture_recipe_from_task(p_parent_task_id uuid, p_recipe_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_project_id uuid;
  v_child_count int;
  v_step_count int := 0;
  v_mat_count int := 0;
  v_pos int := 0;
  v_step_id uuid;
  v_child RECORD;
  v_mat RECORD;
  v_existing_step_id uuid;
  v_candidate_ids uuid[];
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT project_id INTO v_project_id FROM tasks WHERE id = p_parent_task_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Parent task not found'; END IF;

  PERFORM 1 FROM task_recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipe not found'; END IF;

  IF NOT (is_admin(v_user) OR get_project_role(v_user, v_project_id) = 'manager'::project_member_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO v_child_count FROM tasks WHERE parent_task_id = p_parent_task_id;
  IF v_child_count = 0 THEN
    RETURN jsonb_build_object('steps_written', 0, 'materials_written', 0);
  END IF;

  FOR v_child IN
    SELECT id, task, sort_order, trade, assignment_mode,
           row_number() OVER (ORDER BY sort_order NULLS LAST, created_at) AS pos
    FROM tasks
    WHERE parent_task_id = p_parent_task_id
    ORDER BY sort_order NULLS LAST, created_at
  LOOP
    v_pos := v_child.pos::int;
    v_step_count := v_step_count + 1;

    -- Gather crew candidates for this child task
    SELECT array_agg(user_id) INTO v_candidate_ids
    FROM task_candidates
    WHERE task_id = v_child.id;

    SELECT id INTO v_existing_step_id
    FROM task_recipe_steps
    WHERE recipe_id = p_recipe_id AND sort_order = v_pos * 10
    LIMIT 1;

    IF v_existing_step_id IS NOT NULL THEN
      UPDATE task_recipe_steps
      SET title = v_child.task,
          trade = v_child.trade,
          assignment_mode = COALESCE(v_child.assignment_mode, 'solo'),
          default_candidate_user_ids = COALESCE(v_candidate_ids, '{}')
      WHERE id = v_existing_step_id;
      v_step_id := v_existing_step_id;
    ELSE
      INSERT INTO task_recipe_steps (recipe_id, title, sort_order, trade, assignment_mode, default_candidate_user_ids)
      VALUES (p_recipe_id, v_child.task, v_pos * 10, v_child.trade,
              COALESCE(v_child.assignment_mode, 'solo'),
              COALESCE(v_candidate_ids, '{}'))
      RETURNING id INTO v_step_id;
    END IF;

    FOR v_mat IN
      SELECT name, quantity, unit, sku, vendor_url, store_section, provided_by, item_type, unit_cost
      FROM task_materials
      WHERE task_id = v_child.id AND is_active = true
    LOOP
      UPDATE task_recipe_step_materials
      SET qty = v_mat.quantity, unit = v_mat.unit, sku = v_mat.sku,
          vendor_url = v_mat.vendor_url, store_section = v_mat.store_section,
          provided_by = v_mat.provided_by, item_type = COALESCE(v_mat.item_type, 'material'),
          unit_cost = v_mat.unit_cost
      WHERE recipe_step_id = v_step_id AND material_name = v_mat.name;

      IF NOT FOUND THEN
        INSERT INTO task_recipe_step_materials (recipe_step_id, material_name, qty, unit, sku, vendor_url, store_section, provided_by, item_type, unit_cost)
        VALUES (v_step_id, v_mat.name, v_mat.quantity, v_mat.unit, v_mat.sku, v_mat.vendor_url, v_mat.store_section, v_mat.provided_by, COALESCE(v_mat.item_type, 'material'), v_mat.unit_cost);
      END IF;

      v_mat_count := v_mat_count + 1;
    END LOOP;

    DELETE FROM task_recipe_step_materials
    WHERE recipe_step_id = v_step_id
      AND material_name NOT IN (
        SELECT name FROM task_materials WHERE task_id = v_child.id AND is_active = true
      );
  END LOOP;

  DELETE FROM task_recipe_step_materials
  WHERE recipe_step_id IN (
    SELECT id FROM task_recipe_steps
    WHERE recipe_id = p_recipe_id AND sort_order > v_child_count * 10
  );
  DELETE FROM task_recipe_steps
  WHERE recipe_id = p_recipe_id AND sort_order > v_child_count * 10;

  RETURN jsonb_build_object('steps_written', v_step_count, 'materials_written', v_mat_count);
END;
$$;
