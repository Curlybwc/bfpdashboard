ALTER TABLE public.cost_items ADD COLUMN IF NOT EXISTS normalized_name text;

-- Backfill existing rows
UPDATE public.cost_items SET normalized_name = lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) WHERE normalized_name IS NULL;

-- Create unique index on normalized_name
CREATE UNIQUE INDEX IF NOT EXISTS cost_items_normalized_name_unique ON public.cost_items (normalized_name);