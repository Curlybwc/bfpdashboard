
-- Remove the singleton constraints that prevent multi-company settings
ALTER TABLE public.quickbooks_settings DROP CONSTRAINT quickbooks_settings_singleton;
ALTER TABLE public.quickbooks_settings DROP CONSTRAINT quickbooks_settings_singleton_check;

-- Add a unique constraint on company_id so each company gets one settings row
ALTER TABLE public.quickbooks_settings ADD CONSTRAINT quickbooks_settings_company_id_unique UNIQUE (company_id);
