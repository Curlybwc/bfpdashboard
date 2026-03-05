
-- Drop NOT NULL on keywords
ALTER TABLE public.task_recipes ALTER COLUMN keywords DROP NOT NULL;

-- Add created_by to recipe steps
ALTER TABLE public.task_recipe_steps ADD COLUMN created_by uuid;

-- Add index for parent task hierarchy
CREATE INDEX idx_tasks_parent ON public.tasks(parent_task_id);

-- Create expand_recipe RPC
CREATE OR REPLACE FUNCTION public.expand_recipe(
  p_parent_task_id uuid,
  p_recipe_id uuid,
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parent RECORD;
  v_step RECORD;
  v_count integer := 0;
BEGIN
  -- Fetch and validate parent task
  SELECT id, project_id, trade, priority, room_area, expanded_recipe_id
  INTO v_parent
  FROM public.tasks
  WHERE id = p_parent_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent task not found';
  END IF;

  -- Check expansion guard: no existing children
  IF EXISTS (SELECT 1 FROM public.tasks WHERE parent_task_id = p_parent_task_id) THEN
    RAISE EXCEPTION 'Task already has children';
  END IF;

  -- Check expansion guard: not already expanded
  IF v_parent.expanded_recipe_id IS NOT NULL THEN
    RAISE EXCEPTION 'Task already expanded from a recipe';
  END IF;

  -- Insert child tasks from recipe steps
  FOR v_step IN
    SELECT id, title, sort_order, trade, notes
    FROM public.task_recipe_steps
    WHERE recipe_id = p_recipe_id
    ORDER BY sort_order
  LOOP
    INSERT INTO public.tasks (
      project_id,
      parent_task_id,
      task,
      sort_order,
      source_recipe_id,
      source_recipe_step_id,
      trade,
      priority,
      room_area,
      stage,
      materials_on_site,
      created_by
    ) VALUES (
      v_parent.project_id,
      p_parent_task_id,
      v_step.title,
      v_step.sort_order * 10,
      p_recipe_id,
      v_step.id,
      COALESCE(v_step.trade, v_parent.trade),
      v_parent.priority,
      v_parent.room_area,
      'Not Ready',
      'No',
      p_user_id
    );
    v_count := v_count + 1;
  END LOOP;

  -- Update parent with expanded_recipe_id
  UPDATE public.tasks
  SET expanded_recipe_id = p_recipe_id
  WHERE id = p_parent_task_id;

  RETURN v_count;
END;
$$;
