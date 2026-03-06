
-- Add new values to scope_status enum
ALTER TYPE public.scope_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.scope_status ADD VALUE IF NOT EXISTS 'archived';
