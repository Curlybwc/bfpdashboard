ALTER TABLE public.task_materials
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS vendor_url text;