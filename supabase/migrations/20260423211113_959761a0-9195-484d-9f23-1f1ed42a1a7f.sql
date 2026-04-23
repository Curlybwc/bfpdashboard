CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
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
    IF OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage = 'Done'::task_stage THEN
      v_action := 'task_completed';
      v_actor := COALESCE(NEW.claimed_by_user_id, NEW.assigned_to_user_id, NEW.created_by);
      v_description := 'Completed task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    IF OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage = 'In Progress'::task_stage THEN
      v_action := 'task_started';
      v_actor := COALESCE(NEW.started_by_user_id, NEW.claimed_by_user_id, NEW.created_by);
      v_description := 'Started task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    IF OLD.claimed_by_user_id IS NULL AND NEW.claimed_by_user_id IS NOT NULL THEN
      v_action := 'task_claimed';
      v_actor := NEW.claimed_by_user_id;
      v_description := 'Claimed task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    IF OLD.claimed_by_user_id IS NOT NULL AND NEW.claimed_by_user_id IS NULL AND NEW.stage <> 'Done'::task_stage THEN
      v_action := 'task_unclaimed';
      v_actor := OLD.claimed_by_user_id;
      v_description := 'Unclaimed task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

    IF OLD.is_blocked = false AND NEW.is_blocked = true THEN
      v_action := 'task_blocked';
      v_actor := COALESCE(NEW.claimed_by_user_id, NEW.created_by);
      v_description := 'Blocked task: ' || NEW.task;
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, project_id, description, metadata)
      VALUES (v_actor, v_action, 'task', NEW.id, NEW.project_id, v_description, v_meta);
    END IF;

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