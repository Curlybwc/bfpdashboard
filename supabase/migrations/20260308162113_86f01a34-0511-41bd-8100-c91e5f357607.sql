
-- Add recurrence columns to tasks
ALTER TABLE public.tasks
  ADD COLUMN is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN recurrence_frequency text,
  ADD COLUMN recurrence_anchor_date date,
  ADD COLUMN recurrence_source_task_id uuid REFERENCES public.tasks(id);

-- Validation trigger
CREATE OR REPLACE FUNCTION public.validate_recurrence()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.recurrence_frequency IS NOT NULL AND NEW.recurrence_frequency NOT IN ('weekly','monthly','yearly') THEN
    RAISE EXCEPTION 'Invalid recurrence_frequency';
  END IF;
  IF NEW.is_recurring AND NEW.recurrence_frequency IS NULL THEN
    RAISE EXCEPTION 'recurrence_frequency required when is_recurring is true';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_recurrence
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_recurrence();

-- RPC to complete a recurring task and spawn next occurrence
CREATE OR REPLACE FUNCTION public.complete_recurring_task(p_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task RECORD;
  v_next_due date;
  v_new_id uuid;
BEGIN
  -- Lock and fetch the task
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

  -- Mark as Done
  UPDATE tasks SET
    stage = 'Done',
    completed_at = now()
  WHERE id = p_task_id;

  -- If not recurring, just return null
  IF NOT v_task.is_recurring THEN RETURN NULL; END IF;

  -- Idempotency: check if next occurrence already exists
  IF EXISTS (SELECT 1 FROM tasks WHERE recurrence_source_task_id = p_task_id) THEN
    RETURN NULL;
  END IF;

  -- Compute next due date
  IF v_task.due_date IS NULL THEN RETURN NULL; END IF;

  IF v_task.recurrence_frequency = 'weekly' THEN
    v_next_due := v_task.due_date + interval '7 days';
  ELSIF v_task.recurrence_frequency = 'monthly' THEN
    v_next_due := v_task.due_date + interval '1 month';
  ELSIF v_task.recurrence_frequency = 'yearly' THEN
    v_next_due := v_task.due_date + interval '1 year';
  ELSE
    RETURN NULL;
  END IF;

  -- Insert next occurrence
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
    NULL, NULL, NULL,
    NULL, NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
