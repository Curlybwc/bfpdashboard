ALTER TABLE public.task_materials
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS provided_by text NOT NULL DEFAULT 'either',
  ADD COLUMN IF NOT EXISTS confirmed_on_site boolean NOT NULL DEFAULT false;