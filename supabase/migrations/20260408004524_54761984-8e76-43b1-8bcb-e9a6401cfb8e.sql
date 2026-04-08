
CREATE OR REPLACE FUNCTION public.convert_scope_to_project(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_scope RECORD;
  v_project_id uuid;
  v_estimated_total numeric;
  v_has_missing boolean;
  v_task_count integer := 0;
  v_task_row RECORD;
  v_org_id uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_admin(v_caller) OR can_manage_projects(v_caller)) THEN
    RAISE EXCEPTION 'Not authorized to convert scopes';
  END IF;

  -- Get caller's org
  SELECT org_id INTO v_org_id FROM public.profiles WHERE id = v_caller;

  SELECT id, name, address, status
  INTO v_scope
  FROM public.scopes
  WHERE id = p_scope_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope not found';
  END IF;

  IF v_scope.status != 'active' THEN
    RAISE EXCEPTION 'Only active scopes can be converted';
  END IF;

  SELECT COALESCE(SUM(COALESCE(computed_total, 0)), 0)
  INTO v_estimated_total
  FROM public.scope_items
  WHERE scope_id = p_scope_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.scope_items
    WHERE scope_id = p_scope_id
      AND (
        status IN ('Repair', 'Replace', 'Get Bid')
        OR (computed_total IS NOT NULL AND computed_total > 0)
      )
      AND (computed_total IS NULL OR computed_total = 0)
  ) INTO v_has_missing;

  INSERT INTO public.projects (name, address, scope_id, has_missing_estimates, org_id)
  VALUES (
    COALESCE(v_scope.name, 'Converted Project'),
    v_scope.address,
    p_scope_id,
    v_has_missing,
    v_org_id
  )
  RETURNING id INTO v_project_id;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_project_id, v_caller, 'manager'::project_member_role);

  UPDATE public.scopes
  SET estimated_total_snapshot = v_estimated_total
  WHERE id = p_scope_id;

  FOR v_task_row IN
    INSERT INTO public.tasks (project_id, task, source_scope_item_id, recipe_hint_id, stage, priority, materials_on_site, created_by)
    SELECT
      v_project_id,
      si.description,
      si.id,
      si.recipe_hint_id,
      'Ready'::task_stage,
      '2 – This Week'::task_priority,
      'No'::materials_status,
      v_caller
    FROM public.scope_items si
    WHERE si.scope_id = p_scope_id
      AND (
        si.status IN ('Repair', 'Replace', 'Get Bid')
        OR (si.computed_total IS NOT NULL AND si.computed_total > 0)
      )
    RETURNING id
  LOOP
    v_task_count := v_task_count + 1;
    PERFORM apply_assignment_rules(v_task_row.id);
  END LOOP;

  RETURN jsonb_build_object(
    'project_id', v_project_id,
    'task_count', v_task_count,
    'estimated_total', v_estimated_total,
    'has_missing_estimates', v_has_missing
  );
END;
$$;
