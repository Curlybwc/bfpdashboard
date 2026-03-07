
-- 1. Create assignment_rules table
CREATE TABLE public.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  match_mode text NOT NULL DEFAULT 'contains',
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  outcome_type text NOT NULL,
  outcome_user_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as task_material_bundles)
CREATE POLICY "View assignment rules" ON public.assignment_rules
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert assignment rules" ON public.assignment_rules
  FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Update assignment rules" ON public.assignment_rules
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Delete assignment rules" ON public.assignment_rules
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- updated_at trigger
CREATE TRIGGER update_assignment_rules_updated_at
  BEFORE UPDATE ON public.assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add is_outside_vendor to tasks
ALTER TABLE public.tasks ADD COLUMN is_outside_vendor boolean NOT NULL DEFAULT false;

-- 3. Create apply_assignment_rules function
CREATE OR REPLACE FUNCTION public.apply_assignment_rules(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task RECORD;
  v_rule RECORD;
  v_task_norm text;
  v_kw text;
  v_kw_norm text;
  v_matched boolean;
  v_is_member boolean;
BEGIN
  SELECT id, task, project_id, assigned_to_user_id, assignment_mode, is_outside_vendor
  INTO v_task FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN RETURN; END IF;
  -- Skip if already assigned manually
  IF v_task.assigned_to_user_id IS NOT NULL THEN RETURN; END IF;

  v_task_norm := lower(trim(regexp_replace(regexp_replace(v_task.task, '[^\w\s]', ' ', 'g'), '\s+', ' ', 'g')));

  FOR v_rule IN
    SELECT * FROM assignment_rules WHERE active = true ORDER BY priority ASC, created_at ASC
  LOOP
    v_matched := false;
    FOREACH v_kw IN ARRAY v_rule.keywords LOOP
      v_kw_norm := lower(trim(regexp_replace(regexp_replace(v_kw, '[^\w\s]', ' ', 'g'), '\s+', ' ', 'g')));
      IF v_kw_norm = '' THEN CONTINUE; END IF;

      IF v_rule.match_mode = 'exact' AND v_task_norm = v_kw_norm THEN
        v_matched := true; EXIT;
      ELSIF v_rule.match_mode = 'contains' AND v_task_norm LIKE '%' || v_kw_norm || '%' THEN
        v_matched := true; EXIT;
      END IF;
    END LOOP;

    IF NOT v_matched THEN CONTINUE; END IF;

    -- Apply first matching rule
    IF v_rule.outcome_type = 'outside_vendor' THEN
      UPDATE tasks SET is_outside_vendor = true WHERE id = p_task_id;
    ELSIF v_rule.outcome_type = 'crew' THEN
      UPDATE tasks SET assignment_mode = 'crew' WHERE id = p_task_id;
    ELSIF v_rule.outcome_type = 'assign_user' AND v_rule.outcome_user_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM project_members
        WHERE project_id = v_task.project_id AND user_id = v_rule.outcome_user_id
      ) INTO v_is_member;
      IF v_is_member THEN
        UPDATE tasks SET assigned_to_user_id = v_rule.outcome_user_id WHERE id = p_task_id;
      END IF;
    END IF;

    RETURN; -- first-match-wins
  END LOOP;
END;
$$;

-- 4. Update convert_scope_to_project to call apply_assignment_rules for each created task
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
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_admin(v_caller) OR can_manage_projects(v_caller)) THEN
    RAISE EXCEPTION 'Not authorized to convert scopes';
  END IF;

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

  INSERT INTO public.projects (name, address, scope_id, has_missing_estimates)
  VALUES (
    COALESCE(v_scope.name, 'Converted Project'),
    v_scope.address,
    p_scope_id,
    v_has_missing
  )
  RETURNING id INTO v_project_id;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_project_id, v_caller, 'manager'::project_member_role);

  UPDATE public.scopes
  SET estimated_total_snapshot = v_estimated_total
  WHERE id = p_scope_id;

  -- Create tasks and apply assignment rules to each
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
