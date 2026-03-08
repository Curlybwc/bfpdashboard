-- Ensure assignment rules only stop on a successfully applied outcome.
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
  v_applied boolean;
BEGIN
  SELECT id, task, project_id, assigned_to_user_id
  INTO v_task FROM tasks WHERE id = p_task_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Skip if already assigned manually.
  IF v_task.assigned_to_user_id IS NOT NULL THEN
    RETURN;
  END IF;

  v_task_norm := lower(trim(regexp_replace(regexp_replace(v_task.task, '[^\\w\\s]', ' ', 'g'), '\\s+', ' ', 'g')));

  FOR v_rule IN
    SELECT *
    FROM assignment_rules
    WHERE active = true
    ORDER BY priority ASC, created_at ASC
  LOOP
    v_matched := false;

    FOREACH v_kw IN ARRAY v_rule.keywords LOOP
      v_kw_norm := lower(trim(regexp_replace(regexp_replace(v_kw, '[^\\w\\s]', ' ', 'g'), '\\s+', ' ', 'g')));
      IF v_kw_norm = '' THEN
        CONTINUE;
      END IF;

      IF v_rule.match_mode = 'exact' AND v_task_norm = v_kw_norm THEN
        v_matched := true;
        EXIT;
      ELSIF v_rule.match_mode = 'contains' AND v_task_norm LIKE '%' || v_kw_norm || '%' THEN
        v_matched := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_matched THEN
      CONTINUE;
    END IF;

    v_applied := false;

    -- Apply first matching rule that can actually be applied.
    IF v_rule.outcome_type = 'outside_vendor' THEN
      UPDATE tasks
      SET is_outside_vendor = true
      WHERE id = p_task_id;
      v_applied := true;

    ELSIF v_rule.outcome_type = 'crew' THEN
      UPDATE tasks
      SET assignment_mode = 'crew'
      WHERE id = p_task_id;
      v_applied := true;

    ELSIF v_rule.outcome_type = 'assign_user' AND v_rule.outcome_user_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1
        FROM project_members
        WHERE project_id = v_task.project_id
          AND user_id = v_rule.outcome_user_id
      ) INTO v_is_member;

      IF v_is_member THEN
        UPDATE tasks
        SET assigned_to_user_id = v_rule.outcome_user_id
        WHERE id = p_task_id;
        v_applied := true;
      END IF;
    END IF;

    IF v_applied THEN
      RETURN;
    END IF;
  END LOOP;
END;
$$;
