
-- Activity log table
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_activity_log_created_at ON public.activity_log (created_at DESC);
CREATE INDEX idx_activity_log_project_id ON public.activity_log (project_id);
CREATE INDEX idx_activity_log_actor_id ON public.activity_log (actor_id);
CREATE INDEX idx_activity_log_action ON public.activity_log (action);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Admins and managers can view logs
CREATE POLICY "Admins can view activity logs"
  ON public.activity_log FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

-- System insert (security definer trigger will bypass RLS)
CREATE POLICY "System can insert activity logs"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Trigger function to log task changes
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_description text;
  v_actor uuid;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'task_created';
    v_actor := NEW.created_by;
    v_description := 'Created task: ' || NEW.task;
    INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
    VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Task completed
    IF OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage = 'done' THEN
      v_action := 'task_completed';
      v_actor := COALESCE(NEW.claimed_by_user_id, NEW.assigned_to_user_id, NEW.created_by);
      v_description := 'Completed task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    -- Task started
    IF OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage = 'in_progress' THEN
      v_action := 'task_started';
      v_actor := COALESCE(NEW.started_by_user_id, NEW.claimed_by_user_id, NEW.created_by);
      v_description := 'Started task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    -- Task claimed (dibs)
    IF OLD.claimed_by_user_id IS NULL AND NEW.claimed_by_user_id IS NOT NULL THEN
      v_action := 'task_claimed';
      v_actor := NEW.claimed_by_user_id;
      v_description := 'Claimed task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    -- Task unclaimed
    IF OLD.claimed_by_user_id IS NOT NULL AND NEW.claimed_by_user_id IS NULL AND NEW.stage != 'done' THEN
      v_action := 'task_unclaimed';
      v_actor := OLD.claimed_by_user_id;
      v_description := 'Unclaimed task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    -- Task blocked
    IF OLD.is_blocked = false AND NEW.is_blocked = true THEN
      v_action := 'task_blocked';
      v_actor := COALESCE(NEW.claimed_by_user_id, NEW.created_by);
      v_description := 'Blocked task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    -- Task unblocked
    IF OLD.is_blocked = true AND NEW.is_blocked = false THEN
      v_action := 'task_unblocked';
      v_actor := COALESCE(NEW.claimed_by_user_id, NEW.created_by);
      v_description := 'Unblocked task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_task_activity
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();
