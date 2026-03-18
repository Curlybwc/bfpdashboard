
CREATE OR REPLACE FUNCTION public.merge_projects(p_project_a uuid, p_project_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_id uuid;
  v_secondary_id uuid;
  v_count_a int;
  v_count_b int;
  v_secondary_scope_id uuid;
  v_primary_scope_id uuid;
  v_shift RECORD;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can merge projects';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_a) THEN
    RAISE EXCEPTION 'Project A not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_b) THEN
    RAISE EXCEPTION 'Project B not found';
  END IF;

  SELECT count(*) INTO v_count_a FROM tasks WHERE project_id = p_project_a;
  SELECT count(*) INTO v_count_b FROM tasks WHERE project_id = p_project_b;

  IF v_count_a >= v_count_b THEN
    v_primary_id := p_project_a;
    v_secondary_id := p_project_b;
  ELSE
    v_primary_id := p_project_b;
    v_secondary_id := p_project_a;
  END IF;

  -- Move tasks
  UPDATE tasks SET project_id = v_primary_id WHERE project_id = v_secondary_id;

  -- Move shifts: merge hours for duplicates, move the rest
  FOR v_shift IN
    SELECT s.id, s.user_id, s.shift_date, s.total_hours, s.start_time, s.end_time, s.hourly_rate_snapshot
    FROM shifts s
    WHERE s.project_id = v_secondary_id
  LOOP
    IF EXISTS (
      SELECT 1 FROM shifts
      WHERE project_id = v_primary_id AND user_id = v_shift.user_id AND shift_date = v_shift.shift_date
    ) THEN
      -- Add hours to existing shift
      UPDATE shifts
      SET total_hours = total_hours + v_shift.total_hours,
          end_time = NULL,
          start_time = NULL
      WHERE project_id = v_primary_id AND user_id = v_shift.user_id AND shift_date = v_shift.shift_date;

      -- Move allocations to the primary shift
      UPDATE shift_task_allocations
      SET shift_id = (SELECT id FROM shifts WHERE project_id = v_primary_id AND user_id = v_shift.user_id AND shift_date = v_shift.shift_date)
      WHERE shift_id = v_shift.id;

      DELETE FROM shifts WHERE id = v_shift.id;
    ELSE
      UPDATE shifts SET project_id = v_primary_id WHERE id = v_shift.id;
    END IF;
  END LOOP;

  -- Move field captures
  UPDATE field_captures SET project_id = v_primary_id WHERE project_id = v_secondary_id;

  -- Move material inventory
  UPDATE material_inventory SET project_id = v_primary_id WHERE project_id = v_secondary_id;

  -- Move tenants
  UPDATE tenants SET project_id = v_primary_id WHERE project_id = v_secondary_id;

  -- Move tool stock
  UPDATE tool_stock SET project_id = v_primary_id WHERE project_id = v_secondary_id;

  -- Merge project members (skip duplicates)
  INSERT INTO project_members (project_id, user_id, role)
  SELECT v_primary_id, pm.user_id, pm.role
  FROM project_members pm
  WHERE pm.project_id = v_secondary_id
    AND NOT EXISTS (
      SELECT 1 FROM project_members existing
      WHERE existing.project_id = v_primary_id AND existing.user_id = pm.user_id
    );

  -- Move QB class mapping if primary doesn't have one
  IF NOT EXISTS (SELECT 1 FROM quickbooks_class_mappings WHERE project_id = v_primary_id) THEN
    UPDATE quickbooks_class_mappings SET project_id = v_primary_id WHERE project_id = v_secondary_id;
  END IF;

  -- Move scope link if primary doesn't have one
  SELECT scope_id INTO v_primary_scope_id FROM projects WHERE id = v_primary_id;
  SELECT scope_id INTO v_secondary_scope_id FROM projects WHERE id = v_secondary_id;
  IF v_primary_scope_id IS NULL AND v_secondary_scope_id IS NOT NULL THEN
    UPDATE projects SET scope_id = v_secondary_scope_id WHERE id = v_primary_id;
    UPDATE scopes SET converted_project_id = v_primary_id WHERE id = v_secondary_scope_id AND converted_project_id = v_secondary_id;
  END IF;

  -- Delete secondary project
  DELETE FROM project_members WHERE project_id = v_secondary_id;
  DELETE FROM quickbooks_class_mappings WHERE project_id = v_secondary_id;
  DELETE FROM projects WHERE id = v_secondary_id;

  RETURN v_primary_id;
END;
$$;
