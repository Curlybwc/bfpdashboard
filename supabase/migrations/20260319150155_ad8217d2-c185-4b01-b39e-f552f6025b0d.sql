
-- 1. Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  qb_connection_id uuid REFERENCES public.quickbooks_connections(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read companies" ON public.companies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins full access on companies" ON public.companies
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. Add company_id to projects
ALTER TABLE public.projects ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- 3. Remove single-active-connection constraint
DROP INDEX IF EXISTS uq_one_active_qb_connection;

-- 4. Scope vendor mappings per company
ALTER TABLE public.quickbooks_vendor_mappings ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.quickbooks_vendor_mappings DROP CONSTRAINT IF EXISTS quickbooks_vendor_mappings_user_id_key;
CREATE UNIQUE INDEX uq_vendor_mapping_user_company ON public.quickbooks_vendor_mappings (user_id, company_id);

-- 5. Scope QB settings per company
ALTER TABLE public.quickbooks_settings ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.quickbooks_settings DROP CONSTRAINT IF EXISTS quickbooks_settings_singleton_key;
CREATE UNIQUE INDEX uq_qb_settings_company ON public.quickbooks_settings (company_id);

-- 6. Add company_id to worker_payable_batches
ALTER TABLE public.worker_payable_batches ADD COLUMN company_id uuid REFERENCES public.companies(id);
