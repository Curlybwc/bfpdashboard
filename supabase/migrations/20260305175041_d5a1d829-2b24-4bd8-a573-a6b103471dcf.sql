
-- Create task_recipes table
CREATE TABLE public.task_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade text,
  keywords text[] NOT NULL DEFAULT '{}',
  is_repeatable boolean NOT NULL DEFAULT false,
  estimated_cost numeric,
  last_actual_avg numeric,
  last_actual_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create task_recipe_steps table
CREATE TABLE public.task_recipe_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.task_recipes(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL,
  trade text,
  notes text,
  is_optional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_steps_order ON public.task_recipe_steps(recipe_id, sort_order);

-- Add recipe columns to scope_items
ALTER TABLE public.scope_items ADD COLUMN recipe_hint_id uuid REFERENCES public.task_recipes(id) ON DELETE SET NULL;

-- Add recipe + ordering columns to tasks
ALTER TABLE public.tasks ADD COLUMN sort_order integer;
ALTER TABLE public.tasks ADD COLUMN recipe_hint_id uuid REFERENCES public.task_recipes(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN source_recipe_id uuid REFERENCES public.task_recipes(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN source_recipe_step_id uuid REFERENCES public.task_recipe_steps(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN expanded_recipe_id uuid REFERENCES public.task_recipes(id) ON DELETE SET NULL;

-- RLS on task_recipes
ALTER TABLE public.task_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View task recipes" ON public.task_recipes
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert task recipes" ON public.task_recipes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Update task recipes" ON public.task_recipes
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Delete task recipes" ON public.task_recipes
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

-- RLS on task_recipe_steps
ALTER TABLE public.task_recipe_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View recipe steps" ON public.task_recipe_steps
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert recipe steps" ON public.task_recipe_steps
  FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Update recipe steps" ON public.task_recipe_steps
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

CREATE POLICY "Delete recipe steps" ON public.task_recipe_steps
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) OR can_manage_projects(auth.uid()));

-- updated_at trigger for task_recipes
CREATE TRIGGER update_task_recipes_updated_at
  BEFORE UPDATE ON public.task_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
