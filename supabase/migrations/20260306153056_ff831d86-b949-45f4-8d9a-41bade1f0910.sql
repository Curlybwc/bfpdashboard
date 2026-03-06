ALTER TABLE public.scope_items
  ADD COLUMN IF NOT EXISTS estimated_hours numeric,
  ADD COLUMN IF NOT EXISTS estimated_labor_cost numeric,
  ADD COLUMN IF NOT EXISTS estimated_material_cost numeric;