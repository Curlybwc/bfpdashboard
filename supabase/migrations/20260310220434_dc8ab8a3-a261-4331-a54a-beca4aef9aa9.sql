ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_package boolean NOT NULL DEFAULT false;
