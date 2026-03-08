
-- Add project_type enum
CREATE TYPE public.project_type AS ENUM ('construction', 'rental');

-- Add column with default
ALTER TABLE public.projects
  ADD COLUMN project_type public.project_type NOT NULL DEFAULT 'construction';
