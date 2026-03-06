
CREATE OR REPLACE FUNCTION public.convert_scope_to_project(p_scope_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_scope RECORD;
  v_project_id uuid;
  v_estimated_total numeric;
  v_has_missing boolean;
  v_task_count integer := 0;
BEGIN
  -- Auth check
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Permission: must be able to create projects (matches projects INSERT RLS)
  IF NOT (is_admin(v_caller) OR can_manage_projects(v_caller)) THEN
    RAISE EXCEPTION 'Not authorized to convert scopes';
  END IF;

  -- Fetch and validate scope
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

  -- Compute estimated_total_snapshot from ALL items (matches frontend: items.reduce sum)
  SELECT COALESCE(SUM(COALESCE(computed_total, 0)), 0)
  INTO v_estimated_total
  FROM public.scope_items
  WHERE scope_id = p_scope_id;

  -- Detect missing estimates among convertible items
  -- Convertible: status IN ('Repair','Replace','Get Bid') OR (computed_total > 0)
  -- Missing: computed_total IS NULL OR computed_total = 0 (matches frontend: !item.computed_total || item.computed_total === 0)
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

  -- Create project
  INSERT INTO public.projects (name, address, scope_id, has_missing_estimates)
  VALUES (
    COALESCE(v_scope.name, 'Converted Project'),
    v_scope.address,
    p_scope_id,
    v_has_missing
  )
  RETURNING id INTO v_project_id;

  -- Create project membership for caller as manager
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_project_id, v_caller, 'manager'::project_member_role);

  -- Snapshot the estimate on the scope (scope remains active — reusable blueprint)
  UPDATE public.scopes
  SET estimated_total_snapshot = v_estimated_total
  WHERE id = p_scope_id;

  -- Create tasks from convertible scope items
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
    );

  GET DIAGNOSTICS v_task_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'project_id', v_project_id,
    'task_count', v_task_count,
    'estimated_total', v_estimated_total,
    'has_missing_estimates', v_has_missing
  );
END;
$function$;
