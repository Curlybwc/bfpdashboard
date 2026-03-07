
-- 1. Partial unique index: only one unresolved blocker per task
CREATE UNIQUE INDEX idx_task_blockers_one_active
  ON public.task_blockers (task_id)
  WHERE resolved_at IS NULL;

-- 2. Trigger function: sync tasks.is_blocked on INSERT/UPDATE/DELETE of task_blockers
CREATE OR REPLACE FUNCTION public.sync_task_is_blocked()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_task_id uuid;
  v_has_active boolean;
BEGIN
  -- Determine which task_id was affected
  IF TG_OP = 'DELETE' THEN
    v_task_id := OLD.task_id;
  ELSE
    v_task_id := NEW.task_id;
  END IF;

  -- Also handle UPDATE that changes task_id (unlikely but safe)
  IF TG_OP = 'UPDATE' AND OLD.task_id IS DISTINCT FROM NEW.task_id THEN
    -- Sync the old task_id too
    SELECT EXISTS (
      SELECT 1 FROM public.task_blockers
      WHERE task_id = OLD.task_id AND resolved_at IS NULL
    ) INTO v_has_active;
    UPDATE public.tasks SET is_blocked = v_has_active WHERE id = OLD.task_id;
  END IF;

  -- Sync the current task_id
  SELECT EXISTS (
    SELECT 1 FROM public.task_blockers
    WHERE task_id = v_task_id AND resolved_at IS NULL
  ) INTO v_has_active;

  UPDATE public.tasks SET is_blocked = v_has_active WHERE id = v_task_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger to task_blockers
CREATE TRIGGER trg_sync_task_is_blocked
  AFTER INSERT OR UPDATE OR DELETE ON public.task_blockers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_is_blocked();
