
CREATE OR REPLACE FUNCTION public.validate_recurrence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.recurrence_frequency IS NOT NULL AND NEW.recurrence_frequency NOT IN ('weekly','biweekly','monthly','yearly') THEN
    RAISE EXCEPTION 'Invalid recurrence_frequency';
  END IF;
  IF NEW.is_recurring AND NEW.recurrence_frequency IS NULL THEN
    RAISE EXCEPTION 'recurrence_frequency required when is_recurring is true';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_recurring_task(p_task_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task RECORD;
  v_next_due date;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  UPDATE tasks SET stage = 'Done', completed_at = now() WHERE id = p_task_id;

  IF NOT v_task.is_recurring THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM tasks WHERE recurrence_source_task_id = p_task_id) THEN
    RETURN NULL;
  END IF;

  IF v_task.due_date IS NULL THEN RETURN NULL; END IF;

  IF v_task.recurrence_frequency = 'weekly' THEN
    v_next_due := v_task.due_date + interval '7 days';
  ELSIF v_task.recurrence_frequency = 'biweekly' THEN
    v_next_due := v_task.due_date + interval '14 days';
  ELSIF v_task.recurrence_frequency = 'monthly' THEN
    v_next_due := v_task.due_date + interval '1 month';
  ELSIF v_task.recurrence_frequency = 'yearly' THEN
    v_next_due := v_task.due_date + interval '1 year';
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO tasks (
    project_id, task, priority, trade, room_area, notes,
    assigned_to_user_id, source_scope_item_id, source_recipe_id,
    is_recurring, recurrence_frequency, recurrence_anchor_date,
    recurrence_source_task_id,
    assignment_mode, is_outside_vendor,
    due_date, stage, materials_on_site, created_by,
    started_at, started_by_user_id, completed_at,
    claimed_by_user_id, claimed_at
  ) VALUES (
    v_task.project_id, v_task.task, v_task.priority, v_task.trade, v_task.room_area, v_task.notes,
    v_task.assigned_to_user_id, v_task.source_scope_item_id, v_task.source_recipe_id,
    true, v_task.recurrence_frequency, v_task.recurrence_anchor_date,
    p_task_id,
    v_task.assignment_mode, v_task.is_outside_vendor,
    v_next_due, 'Ready', 'No', v_task.created_by,
    NULL, NULL, NULL, NULL, NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;
