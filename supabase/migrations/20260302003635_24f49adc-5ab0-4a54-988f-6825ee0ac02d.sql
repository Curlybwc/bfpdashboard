
ALTER TABLE public.task_materials
  ADD COLUMN IF NOT EXISTS store_section text,
  ADD COLUMN IF NOT EXISTS store_section_manual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_task_materials_store_section ON public.task_materials (store_section);
