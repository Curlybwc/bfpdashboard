
CREATE OR REPLACE FUNCTION public.push_recipe_step_to_tasks(p_step_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_step RECORD;
  v_task RECORD;
  v_mat RECORD;
  v_tasks_updated int := 0;
  v_mats_updated int := 0;
  v_candidate_id uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (is_admin(v_user) OR can_manage_projects(v_user)) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT id, title, trade, assignment_mode, default_candidate_user_ids
  INTO v_step
  FROM task_recipe_steps
  WHERE id = p_step_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;

  FOR v_task IN
    UPDATE tasks
    SET task = v_step.title,
        trade = v_step.trade,
        assignment_mode = COALESCE(v_step.assignment_mode, 'solo')
    WHERE source_recipe_step_id = v_step.id
      AND stage != 'Done'
    RETURNING id, project_id
  LOOP
    v_tasks_updated := v_tasks_updated + 1;

    IF v_step.assignment_mode = 'crew' AND array_length(v_step.default_candidate_user_ids, 1) > 0 THEN
      DELETE FROM task_candidates WHERE task_id = v_task.id;
      FOREACH v_candidate_id IN ARRAY v_step.default_candidate_user_ids LOOP
        INSERT INTO task_candidates (task_id, user_id)
        VALUES (v_task.id, v_candidate_id)
        ON CONFLICT (task_id, user_id) DO NOTHING;

        INSERT INTO project_members (project_id, user_id, role)
        VALUES (v_task.project_id, v_candidate_id, 'contractor')
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;

    FOR v_mat IN
      SELECT material_name, qty, unit, sku, vendor_url, store_section, provided_by, item_type, unit_cost
      FROM task_recipe_step_materials
      WHERE recipe_step_id = v_step.id
    LOOP
      UPDATE task_materials
      SET quantity = v_mat.qty, unit = v_mat.unit, sku = v_mat.sku,
          vendor_url = v_mat.vendor_url, store_section = v_mat.store_section,
          provided_by = COALESCE(v_mat.provided_by, 'either'),
          item_type = COALESCE(v_mat.item_type, 'material'),
          unit_cost = v_mat.unit_cost
      WHERE task_id = v_task.id AND lower(trim(name)) = lower(trim(v_mat.material_name)) AND is_active = true;

      IF NOT FOUND THEN
        INSERT INTO task_materials (task_id, name, quantity, unit, sku, vendor_url, store_section, provided_by, item_type, unit_cost)
        VALUES (v_task.id, v_mat.material_name, v_mat.qty, v_mat.unit, v_mat.sku, v_mat.vendor_url, v_mat.store_section,
                COALESCE(v_mat.provided_by, 'either'), COALESCE(v_mat.item_type, 'material'), v_mat.unit_cost);
      END IF;
      v_mats_updated := v_mats_updated + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('tasks_updated', v_tasks_updated, 'materials_synced', v_mats_updated);
END;
$$;
