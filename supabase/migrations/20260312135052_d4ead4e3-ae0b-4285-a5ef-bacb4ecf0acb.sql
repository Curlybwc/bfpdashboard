ALTER TABLE public.task_recipe_step_materials
  ADD COLUMN item_type text NOT NULL DEFAULT 'material',
  ADD COLUMN unit_cost numeric;