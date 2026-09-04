ALTER TABLE public.quickbooks_vendor_mappings
  ADD COLUMN IF NOT EXISTS qb_realm_id text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_error text;

ALTER TABLE public.quickbooks_class_mappings
  ADD COLUMN IF NOT EXISTS qb_realm_id text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_error text;

ALTER TABLE public.quickbooks_settings
  ADD COLUMN IF NOT EXISTS labor_account_realm_id text,
  ADD COLUMN IF NOT EXISTS labor_account_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS reimbursement_account_realm_id text,
  ADD COLUMN IF NOT EXISTS reimbursement_account_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.invalidate_company_qb_mappings(p_company_id uuid, p_reason text DEFAULT 'QuickBooks connection changed')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quickbooks_vendor_mappings
     SET qb_realm_id = NULL, verified_at = NULL, verification_error = p_reason
   WHERE company_id = p_company_id;

  UPDATE public.quickbooks_class_mappings cm
     SET qb_realm_id = NULL, verified_at = NULL, verification_error = p_reason
   WHERE EXISTS (
     SELECT 1 FROM public.projects p
      WHERE p.id = cm.project_id AND p.company_id = p_company_id
   );

  UPDATE public.quickbooks_settings
     SET labor_account_realm_id = NULL,
         labor_account_verified_at = NULL,
         reimbursement_account_realm_id = NULL,
         reimbursement_account_verified_at = NULL
   WHERE company_id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_company_qb_connection_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qb_connection_id IS DISTINCT FROM OLD.qb_connection_id THEN
    PERFORM public.invalidate_company_qb_mappings(NEW.id, 'QuickBooks connection for this company changed — reference must be re-verified');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_qb_connection_change ON public.companies;
CREATE TRIGGER trg_company_qb_connection_change
AFTER UPDATE OF qb_connection_id ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.on_company_qb_connection_change();

GRANT EXECUTE ON FUNCTION public.invalidate_company_qb_mappings(uuid, text) TO service_role;